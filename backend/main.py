import json
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

import chromadb
import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from psycopg.rows import dict_row

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is missing from backend/.env")

CHROMA_DIR = BASE_DIR / "chroma_data"
CHROMA_DIR.mkdir(parents=True, exist_ok=True)

chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))
collection = chroma_client.get_or_create_collection(
    name="labmatch_resources",
    metadata={"hnsw:space": "cosine"},
)


def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def parse_specs(value: Any) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            result = json.loads(value)
            return result if isinstance(result, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def normalized_query(query: str) -> str:
    return " ".join(query.lower().replace("-", " ").replace("_", " ").split())


def make_document(row: dict) -> str:
    specs = parse_specs(row.get("specifications"))
    workloads = specs.get("workloads", [])
    if not isinstance(workloads, list):
        workloads = []
    return (
        f"Resource: {row['name']}\n"
        f"Category: {row['category']}\n"
        f"Description: {row['description']}\n"
        f"Capabilities: {row.get('capabilities') or 'Not specified'}\n"
        f"Specifications: {json.dumps(specs)}\n"
        f"Supported workloads: {', '.join(map(str, workloads))}"
    )


def fetch_active_resources():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.resource_id, r.name, r.description,
                       r.capabilities, r.specifications,
                       c.name AS category
                FROM resources r
                JOIN categories c ON c.category_id = r.category_id
                WHERE r.is_active = TRUE
                ORDER BY r.resource_id
                """
            )
            return cur.fetchall()


def index_resources():
    rows = fetch_active_resources()
    ids = [str(row["resource_id"]) for row in rows]

    if rows:
        collection.upsert(
            ids=ids,
            documents=[make_document(row) for row in rows],
            metadatas=[
                {
                    "resource_id": int(row["resource_id"]),
                    "name": row["name"],
                    "category": row["category"],
                    "capabilities": row.get("capabilities") or "",
                }
                for row in rows
            ],
        )

    # Remove deactivated/deleted resources from the semantic index.
    existing = collection.get(include=["metadatas"])
    current_ids = set(ids)
    stale_ids = [item for item in existing["ids"] if item not in current_ids]
    if stale_ids:
        collection.delete(ids=stale_ids)
    return len(rows)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        index_resources()
    except Exception as exc:
        print(f"Initial indexing failed: {exc}")
    yield


app = FastAPI(
    title="LabMatch Semantic Resource Service",
    version="5.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    query: str = Field(min_length=3, max_length=2000)
    start_time: datetime
    end_time: datetime
    exclude_resource_id: int | None = Field(default=None, ge=1)
    limit: int = Field(default=5, ge=1, le=10)


# Demo tiers only; replace with benchmark data if real performance estimates are needed.
GPU_TIERS = [
    (r"4070\s*ti\s*super", 4),
    (r"rtx\s*3050", 1),
    (r"rtx\s*3060", 2),
    (r"rtx\s*4060\s*ti", 3),
    (r"rtx\s*4060", 2),
    (r"rtx\s*4070", 3),
    (r"rtx\s*4080", 4),
    (r"rtx\s*4090", 5),
    (r"rtx\s*a4000", 2),
    (r"rtx\s*a5000", 4),
    (r"rtx\s*a6000", 5),
    (r"\bh100\b", 5),
]


def gpu_tier(specs: dict, name: str) -> int:
    explicit = specs.get("performance_tier")
    if isinstance(explicit, (int, float)) and 1 <= explicit <= 5:
        return int(explicit)
    model = (str(specs.get("gpu_model", "")) + " " + name).lower()
    for pattern, tier in sorted(GPU_TIERS, key=lambda item: len(item[0]), reverse=True):
        if re.search(pattern, model):
            return tier
    return 0


def detect_profile(query: str) -> dict:
    """
    Detect both the resource category and the task profile.
    Structured constraints decide eligibility; ChromaDB ranks eligible matches.
    """
    text = normalized_query(query)

    # Printer profiles: specific use cases before generic print terms.
    architecture_terms = [
        "architecture", "architectural", "floor plan", "floorplan",
        "cad drawing", "cad plot", "large format", "wide format",
        "engineering drawing", "construction drawing", "blueprint",
        "plot a drawing", "large drawing",
    ]
    if any(term in text for term in architecture_terms):
        return {
            "category": "Printer",
            "name": "large_format_architecture_printing",
            "reason": "Architectural/CAD printing requires a large-format printer, not an A4-only printer.",
            "min_vram_gb": 0,
            "target_tier": 0,
            "printer_requirement": "large_format",
            "camera_requirement": None,
        }

    if any(term in text for term in [
        "black and white", "black-and-white", "monochrome",
        "bulk text", "text documents", "office documents", "many pages",
    ]):
        return {
            "category": "Printer",
            "name": "monochrome_document_printing",
            "reason": "Prioritize monochrome laser printers for high-volume text documents.",
            "min_vram_gb": 0,
            "target_tier": 0,
            "printer_requirement": "monochrome",
            "camera_requirement": None,
        }

    if any(term in text for term in [
        "a4", "assignment", "assignments", "notes", "student report",
        "colour document", "color document", "everyday printing",
        "print a document", "print documents",
    ]):
        return {
            "category": "Printer",
            "name": "a4_document_printing",
            "reason": "Prioritize A4 document printers for ordinary student documents.",
            "min_vram_gb": 0,
            "target_tier": 0,
            "printer_requirement": "a4",
            "camera_requirement": None,
        }

    if any(term in text for term in [
        "printer", "printing", "print a", "print my", "print this",
        "plotter", "plotting",
    ]):
        return {
            "category": "Printer",
            "name": "general_printing",
            "reason": "Rank printers by semantic relevance when no paper size or print type is specified.",
            "min_vram_gb": 0,
            "target_tier": 0,
            "printer_requirement": "general",
            "camera_requirement": None,
        }

    # Camera profiles: distinguish still photography, cinema, and long-form events.
    if any(term in text for term in [
        "lecture", "seminar", "conference", "long duration recording",
        "long form recording", "record a class", "record a lecture",
        "record an event", "extended recording", "camcorder",
    ]):
        return {
            "category": "Camera",
            "name": "long_form_video_recording",
            "reason": "Prioritize a professional camcorder for lectures, seminars, and extended event recording.",
            "min_vram_gb": 0,
            "target_tier": 0,
            "printer_requirement": None,
            "camera_requirement": "camcorder",
        }

    if any(term in text for term in [
        "cinematic", "cinema", "short film", "short films", "filmmaking",
        "film production", "video production", "shoot a video",
        "shoot video", "interview video", "cinematic video",
    ]):
        return {
            "category": "Camera",
            "name": "cinema_video",
            "reason": "Prioritize a cinema-oriented camera for filmmaking and controlled video production.",
            "min_vram_gb": 0,
            "target_tier": 0,
            "printer_requirement": None,
            "camera_requirement": "cinema",
        }

    if any(term in text for term in [
        "photography", "photograph", "portraits", "portrait",
        "still images", "product photos", "product photography",
        "campus photos", "event photography", "take photos",
        "take pictures", "photoshoot", "photo shoot",
    ]):
        return {
            "category": "Camera",
            "name": "photography",
            "reason": "Prioritize mirrorless photography kits for still images, portraits, and photoshoots.",
            "min_vram_gb": 0,
            "target_tier": 0,
            "printer_requirement": None,
            "camera_requirement": "photography",
        }

    if any(term in text for term in [
        "camera", "video recording", "record video", "shooting video",
        "shoot a movie", "record a video",
    ]):
        return {
            "category": "Camera",
            "name": "general_video",
            "reason": "Rank video-capable camera equipment by semantic relevance.",
            "min_vram_gb": 0,
            "target_tier": 0,
            "printer_requirement": None,
            "camera_requirement": "video",
        }

    # GPU profiles: specific tasks before broad DL keywords.
    if any(term in text for term in [
        "large language model training", "train a large language model",
        "large model training", "distributed model training", "train llm",
    ]):
        return {
            "category": "GPU Workstation",
            "name": "large_model_training",
            "min_vram_gb": 40,
            "target_tier": 5,
            "reason": "Large-model training profile: minimum 40 GB VRAM in this demo configuration.",
            "printer_requirement": None,
            "camera_requirement": None,
        }

    if any(term in text for term in [
        "llm fine tuning", "fine tune an llm", "fine tune a language model",
        "fine tune a transformer", "qlora", "lora fine tuning",
    ]):
        return {
            "category": "GPU Workstation",
            "name": "llm_finetuning",
            "min_vram_gb": 16,
            "target_tier": 4,
            "reason": "LLM fine-tuning profile: minimum 16 GB VRAM in this demo configuration.",
            "printer_requirement": None,
            "camera_requirement": None,
        }

    if any(term in text for term in [
        "complex blender scene", "heavy blender scene", "complex 3d scene",
        "large 3d scene", "gpu intensive rendering", "advanced ray tracing",
        "complex ray tracing",
    ]):
        return {
            "category": "GPU Workstation",
            "name": "advanced_3d_rendering",
            "min_vram_gb": 8,
            "target_tier": 4,
            "reason": "Complex rendering profile: prioritize higher GPU performance.",
            "printer_requirement": None,
            "camera_requirement": None,
        }

    if any(term in text for term in [
        "3d rendering", "3d render", "blender", "basic rendering",
        "simple rendering", "render a scene", "ray tracing",
    ]):
        return {
            "category": "GPU Workstation",
            "name": "basic_3d_rendering",
            "min_vram_gb": 8,
            "target_tier": 1,
            "reason": "Basic rendering profile: prefer an adequate lower-tier GPU.",
            "printer_requirement": None,
            "camera_requirement": None,
        }

    if any(term in text for term in [
        "llm inference", "run a local llm", "run an llm",
        "run a large language model", "language model inference",
    ]):
        return {
            "category": "GPU Workstation",
            "name": "llm_inference",
            "min_vram_gb": 12,
            "target_tier": 3,
            "reason": "LLM inference profile: minimum 12 GB VRAM in this demo configuration.",
            "printer_requirement": None,
            "camera_requirement": None,
        }

    if any(term in text for term in [
        "deep learning", "dl training", "train a cnn", "cnn training",
        "convolutional neural network", "neural network training",
        "train a neural network", "train neural networks",
    ]):
        return {
            "category": "GPU Workstation",
            "name": "deep_learning_training",
            "min_vram_gb": 12,
            "target_tier": 3,
            "reason": "Deep-learning training profile: minimum 12 GB VRAM in this demo configuration.",
            "printer_requirement": None,
            "camera_requirement": None,
        }

    if any(term in text for term in [
        "introductory machine learning", "basic machine learning",
        "small machine learning experiments", "scikit learn",
        "small dataset", "linear regression", "machine learning",
    ]):
        return {
            "category": "GPU Workstation",
            "name": "basic_ml",
            "min_vram_gb": 0,
            "target_tier": 1,
            "reason": "Basic ML profile: prioritize sufficient, lower-tier hardware.",
            "printer_requirement": None,
            "camera_requirement": None,
        }

    return {
        "category": None,
        "name": "general",
        "min_vram_gb": 0,
        "target_tier": 0,
        "reason": "No specific task profile detected; use semantic relevance across resources.",
        "printer_requirement": None,
        "camera_requirement": None,
    }


def validate_times(start: datetime, end: datetime):
    if start.tzinfo is None or end.tzinfo is None:
        raise HTTPException(
            status_code=400,
            detail="Start and end times must include a timezone.",
        )
    if end <= start:
        raise HTTPException(
            status_code=400,
            detail="End time must be later than start time.",
        )


def get_semantic_candidates(query: str, exclude_id: int | None):
    total = collection.count()
    if total == 0:
        raise HTTPException(
            status_code=503,
            detail="ChromaDB is empty. Call POST /index-resources first.",
        )

    result = collection.query(
        query_texts=[query],
        n_results=total,
        include=["documents", "metadatas", "distances"],
    )

    candidates = []
    ids = result.get("ids", [[]])[0]
    docs = result.get("documents", [[]])[0]
    metadatas = result.get("metadatas", [[]])[0]
    distances = result.get("distances", [[]])[0]

    for resource_id, doc, metadata, distance in zip(ids, docs, metadatas, distances):
        actual_id = int(metadata["resource_id"])
        if exclude_id is not None and actual_id == exclude_id:
            continue
        candidates.append({
            "resource_id": actual_id,
            "name": metadata["name"],
            "category": metadata["category"],
            "document": doc or "",
            "similarity_distance": float(distance),
        })
    return candidates


def get_resource_rows(candidate_ids: list[int]) -> dict[int, dict]:
    if not candidate_ids:
        return {}
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.resource_id, r.name, r.description, r.capabilities,
                       r.specifications, c.name AS category
                FROM resources r
                JOIN categories c ON c.category_id = r.category_id
                WHERE r.resource_id = ANY(%s)
                  AND r.is_active = TRUE
                """,
                (candidate_ids,),
            )
            return {int(row["resource_id"]): row for row in cur.fetchall()}


def printer_eligible(specs: dict, name: str, requirement: str) -> bool:
    model_text = (name + " " + str(specs.get("model", ""))).lower()
    printer_type = str(specs.get("printer_type", "")).lower()
    paper_size = str(specs.get("max_paper_size", "")).lower()
    width = specs.get("max_paper_width_inches")

    if requirement == "large_format":
        # Explicit width/type required. Never recommend an A4-only printer for plans.
        return (
            printer_type in {"wide_format", "large_format_plotter"}
            or (isinstance(width, (int, float)) and width >= 24)
            or "designjet" in model_text
            or "surecolor t" in model_text
        )

    if requirement == "monochrome":
        return (
            specs.get("colour_printing") is False
            or "monochrome" in printer_type
            or "mono" in printer_type
        )

    if requirement == "a4":
        return paper_size == "a4" or "a4" in model_text or (
            not width and printer_type in {"colour ink tank", "monochrome laser"}
        )

    return True


def camera_eligible(specs: dict, name: str, requirement: str) -> bool:
    camera_type = str(specs.get("camera_type", "")).lower()
    model_text = (name + " " + str(specs.get("model", ""))).lower()
    workloads = specs.get("workloads", [])
    if not isinstance(workloads, list):
        workloads = []
    workloads_text = " ".join(str(item).lower() for item in workloads)

    if requirement == "camcorder":
        return (
            camera_type == "professional_camcorder"
            or "camcorder" in model_text
            or any(word in workloads_text for word in ["lecture_recording", "long_form_video"])
        )
    if requirement == "cinema":
        return (
            camera_type == "cinema_camera"
            or "cinema" in camera_type
            or "fx30" in model_text
            or any(word in workloads_text for word in ["cinema_video", "short_films", "video_production"])
        )
    if requirement == "photography":
        return (
            camera_type == "mirrorless"
            or any(word in workloads_text for word in ["photography", "portraits", "event_coverage"])
        )
    if requirement == "video":
        return (
            camera_type in {"professional_camcorder", "cinema_camera", "mirrorless"}
            or any(word in workloads_text for word in ["general_video", "cinema_video", "lecture_recording"])
        )
    return True


def apply_category_and_capability_filters(
    candidates: list[dict], profile: dict, alternatives: bool
):
    rows = get_resource_rows([item["resource_id"] for item in candidates])
    eligible = []
    excluded = []

    for candidate in candidates:
        row = rows.get(candidate["resource_id"])
        if row is None:
            continue

        category = row["category"]
        specs = parse_specs(row["specifications"])

        # A recognized task must search its matching resource category.
        if profile.get("category") and category != profile["category"]:
            continue

        # Alternatives must remain within the original resource category;
        # run_search supplies that category through profile when needed.
        if category == "GPU Workstation":
            minimum = profile.get("min_vram_gb", 0)
            vram = specs.get("vram_gb")
            if minimum > 0 and (
                not isinstance(vram, (int, float)) or vram < minimum
            ):
                excluded.append(row["name"])
                continue
            candidate["estimated_gpu_tier"] = gpu_tier(specs, row["name"])
        elif category == "Printer":
            requirement = profile.get("printer_requirement") or "general"
            if not printer_eligible(specs, row["name"], requirement):
                excluded.append(row["name"])
                continue
        elif category == "Camera":
            requirement = profile.get("camera_requirement") or "general"
            if not camera_eligible(specs, row["name"], requirement):
                excluded.append(row["name"])
                continue

        candidate["resource_row"] = row
        candidate["specifications"] = specs
        eligible.append(candidate)

    return eligible, excluded


def semantic_scores(candidates: list[dict]):
    if not candidates:
        return
    distances = [item["similarity_distance"] for item in candidates]
    low, high = min(distances), max(distances)
    spread = high - low
    for item in candidates:
        item["semantic_score"] = (
            0.5 if spread < 1e-9
            else 1.0 - ((item["similarity_distance"] - low) / spread)
        )


def rank_candidates(candidates: list[dict], profile: dict):
    if not candidates:
        return []

    semantic_scores(candidates)
    category = profile.get("category")
    target_tier = profile.get("target_tier", 0)
    profile_name = profile.get("name", "general")

    for item in candidates:
        row = item["resource_row"]
        specs = item["specifications"]
        semantic = item["semantic_score"]
        score = semantic

        if category == "GPU Workstation":
            tier = item.get("estimated_gpu_tier", 0)
            if target_tier and tier:
                tier_score = max(0.0, 1.0 - abs(tier - target_tier) / 4.0)
                vram = specs.get("vram_gb", 0)
                minimum = profile.get("min_vram_gb", 0)
                vram_bonus = (
                    min(max(vram - minimum, 0) / 32.0, 1.0) * 0.05
                    if isinstance(vram, (int, float)) and minimum > 0
                    else 0.0
                )
                score = tier_score * 0.80 + semantic * 0.20 + vram_bonus

        elif category == "Printer":
            requirement = profile.get("printer_requirement")
            ptype = str(specs.get("printer_type", "")).lower()
            width = specs.get("max_paper_width_inches", 0)

            if requirement == "large_format":
                # Plotter suitability dominates text similarity.
                width_score = min(float(width or 0) / 36.0, 1.0)
                score = 0.85 + 0.10 * width_score + 0.05 * semantic
            elif requirement == "monochrome":
                score = 0.85 + 0.10 * (1 if "mono" in ptype else 0) + 0.05 * semantic
            elif requirement == "a4":
                score = 0.85 + 0.10 * (1 if str(specs.get("max_paper_size", "")).lower() == "a4" else 0) + 0.05 * semantic

        elif category == "Camera":
            requirement = profile.get("camera_requirement")
            ctype = str(specs.get("camera_type", "")).lower()
            if requirement == "camcorder":
                score = 0.90 + 0.08 * (1 if ctype == "professional_camcorder" else 0) + 0.02 * semantic
            elif requirement == "cinema":
                score = 0.90 + 0.08 * (1 if ctype == "cinema_camera" else 0) + 0.02 * semantic
            elif requirement == "photography":
                score = 0.85 + 0.10 * (1 if ctype == "mirrorless" else 0) + 0.05 * semantic
            elif requirement == "video":
                score = 0.80 + 0.20 * semantic

        item["ranking_score"] = round(score, 4)

    return sorted(
        candidates,
        key=lambda item: (
            -item["ranking_score"],
            item["similarity_distance"],
            item["resource_id"],
        ),
    )


def get_available_resources(candidates: list[dict], start: datetime, end: datetime):
    if not candidates:
        return []

    ids = [item["resource_id"] for item in candidates]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.resource_id, r.name, r.description, r.capabilities,
                       r.specifications, c.name AS category
                FROM resources r
                JOIN categories c ON c.category_id = r.category_id
                WHERE r.is_active = TRUE
                  AND r.resource_id = ANY(%s)
                  AND NOT EXISTS (
                      SELECT 1
                      FROM bookings b
                      WHERE b.resource_id = r.resource_id
                        AND b.status IN ('pending', 'confirmed')
                        AND tstzrange(b.start_time, b.end_time, '[)')
                            && tstzrange(%s::timestamptz, %s::timestamptz, '[)')
                  )
                """,
                (ids, start, end),
            )
            rows = cur.fetchall()

    by_id = {int(row["resource_id"]): row for row in rows}
    output = []
    for candidate in candidates:
        row = by_id.get(candidate["resource_id"])
        if not row:
            continue
        output.append({
            "resource_id": int(row["resource_id"]),
            "name": row["name"],
            "category": row["category"],
            "description": row["description"],
            "capabilities": row.get("capabilities") or "",
            "specifications": parse_specs(row["specifications"]),
            "similarity_distance": candidate["similarity_distance"],
            "ranking_score": candidate.get("ranking_score"),
            "estimated_gpu_tier": candidate.get("estimated_gpu_tier"),
            "recommendation_reason": (
                "Filtered by task requirements, ranked using category-specific "
                "suitability and ChromaDB semantic relevance, then checked for availability."
            ),
        })
    return output


def run_search(request: SearchRequest, alternatives: bool):
    validate_times(request.start_time, request.end_time)

    try:
        exclude_id = request.exclude_resource_id if alternatives else None
        profile = detect_profile(request.query)
        required_category = profile.get("category")

        if alternatives and exclude_id is not None:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT c.name AS category
                        FROM resources r
                        JOIN categories c ON c.category_id = r.category_id
                        WHERE r.resource_id = %s AND r.is_active = TRUE
                        """,
                        (exclude_id,),
                    )
                    row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Resource not found.")
            required_category = row["category"]
            profile = {
                **profile,
                "category": required_category,
                "name": "alternative",
                "reason": "Find similar available resources in the same category.",
                "min_vram_gb": 0,
                "target_tier": 0,
                "printer_requirement": None,
                "camera_requirement": None,
            }

        candidates = get_semantic_candidates(request.query, exclude_id)
        if required_category:
            candidates = [
                item for item in candidates
                if item["category"] == required_category
            ]

        eligible, excluded = apply_category_and_capability_filters(
            candidates, profile, alternatives
        )
        ranked = rank_candidates(eligible, profile)
        available = get_available_resources(
            ranked, request.start_time, request.end_time
        )

        return {
            "success": True,
            "query": request.query,
            "workload_profile": {
                "name": profile["name"],
                "category": profile.get("category"),
                "minimum_vram_gb": profile.get("min_vram_gb", 0),
                "reason": profile.get("reason", ""),
                "excluded_resources": excluded,
            },
            "required_category": required_category,
            "count": min(len(available), request.limit),
            "recommendations" if not alternatives else "alternatives": available[:request.limit],
        }

    except HTTPException:
        raise
    except Exception as exc:
        print(f"Semantic search failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Unable to search resources. Check the FastAPI terminal.",
        ) from exc


@app.get("/health")
def health():
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return {
            "status": "ok",
            "database_connected": True,
            "indexed_resources": collection.count(),
        }
    except Exception as exc:
        return {
            "status": "degraded",
            "database_connected": False,
            "error": str(exc),
            "indexed_resources": collection.count(),
        }


@app.post("/index-resources")
def index_resource_endpoint():
    try:
        count = index_resources()
        return {
            "success": True,
            "indexed_count": count,
            "message": f"Indexed {count} active resources.",
        }
    except Exception as exc:
        print(f"Indexing failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Unable to index resources. Check the FastAPI terminal.",
        ) from exc


@app.post("/recommend-resources")
def recommend_resources(request: SearchRequest):
    return run_search(request, alternatives=False)


@app.post("/search-alternatives")
def search_alternatives(request: SearchRequest):
    return run_search(request, alternatives=True)


@app.get("/api/dashboard/resources")
def dashboard_resources():
    """Return dashboard statistics for resources."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Total resources
                cur.execute("SELECT COUNT(*) FROM resources")
                total_resources = cur.fetchone()["count"]

                # Active resources
                cur.execute("SELECT COUNT(*) FROM resources WHERE is_active = TRUE")
                active_resources = cur.fetchone()["count"]

                # Inactive resources
                cur.execute("SELECT COUNT(*) FROM resources WHERE is_active = FALSE")
                inactive_resources = cur.fetchone()["count"]

                # Resources by category
                cur.execute(
                    """
                    SELECT c.name, COUNT(r.resource_id) as count
                    FROM resources r
                    JOIN categories c ON c.category_id = r.category_id
                    GROUP BY c.name
                    ORDER BY count DESC
                    """
                )
                resources_by_category = cur.fetchall()

                return {
                    "success": True,
                    "total_resources": total_resources,
                    "active_resources": active_resources,
                    "inactive_resources": inactive_resources,
                    "resources_by_category": {
                        row["name"]: row["count"] for row in resources_by_category
                    },
                }
    except Exception as exc:
        print(f"Dashboard resources failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Unable to fetch dashboard data.",
        ) from exc


@app.get("/api/dashboard/users")
def dashboard_users():
    """Return dashboard statistics for users."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM users")
                total_users = cur.fetchone()["count"]

                cur.execute(
                    """
                    SELECT role, COUNT(*) as count
                    FROM users
                    GROUP BY role
                    """
                )
                users_by_role = cur.fetchall()

                return {
                    "success": True,
                    "total_users": total_users,
                    "users_by_role": {row["role"]: row["count"] for row in users_by_role},
                }
    except Exception as exc:
        print(f"Dashboard users failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Unable to fetch dashboard data.",
        ) from exc


@app.get("/api/dashboard/assignments")
def dashboard_assignments():
    """Return dashboard statistics for assignments/bookings."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Total bookings
                cur.execute("SELECT COUNT(*) FROM bookings")
                total_bookings = cur.fetchone()["count"]

                # Confirmed bookings
                cur.execute(
                    """
                    SELECT COUNT(*) FROM bookings
                    WHERE status = 'confirmed'
                    """
                )
                confirmed_bookings = cur.fetchone()["count"]

                # Pending bookings
                cur.execute(
                    """
                    SELECT COUNT(*) FROM bookings
                    WHERE status = 'pending'
                    """
                )
                pending_bookings = cur.fetchone()["count"]

                # Cancelled bookings
                cur.execute(
                    """
                    SELECT COUNT(*) FROM bookings
                    WHERE status = 'cancelled'
                    """
                )
                cancelled_bookings = cur.fetchone()["count"]

                # Resources with active bookings (at most one per resource due to constraint)
                cur.execute("""
                    SELECT COUNT(DISTINCT resource_id) as resources_with_bookings
                    FROM bookings
                    WHERE status IN ('pending', 'confirmed')
                """)
                resources_with_bookings = cur.fetchone()["resources_with_bookings"]

                # Average booking duration
                cur.execute("""
                    SELECT AVG(EXTRACT(EPOCH FROM (end_time - start_time))) / 60 as avg_minutes
                    FROM bookings
                    WHERE status IN ('pending', 'confirmed')
                """)
                avg_duration_result = cur.fetchone()
                avg_duration = round(float(avg_duration_result["avg_minutes"])) if avg_duration_result and avg_duration_result["avg_minutes"] else 0

                return {
                    "success": True,
                    "total_bookings": total_bookings,
                    "confirmed_bookings": confirmed_bookings,
                    "pending_bookings": pending_bookings,
                    "cancelled_bookings": cancelled_bookings,
                    "resources_with_bookings": resources_with_bookings,
                    "average_booking_duration_minutes": avg_duration,
                }
    except Exception as exc:
        print(f"Dashboard assignments failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Unable to fetch dashboard data.",
        ) from exc


@app.get("/api/dashboard/recent-activity")
def dashboard_recent_activity():
    """Return recent activity for the dashboard."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT b.booking_id, b.status, b.start_time, b.end_time,
                           u.name as user_name, r.name as resource_name
                    FROM bookings b
                    JOIN users u ON u.user_id = b.user_id
                    JOIN resources r ON r.resource_id = b.resource_id
                    WHERE b.status IN ('pending', 'confirmed')
                    ORDER BY b.created_at DESC
                    LIMIT 5
                """)
                activities = cur.fetchall()

                return {
                    "success": True,
                    "recent_activity": [
                        {
                            "booking_id": str(activity["booking_id"]),
                            "status": activity["status"],
                            "user_name": activity["user_name"],
                            "resource_name": activity["resource_name"],
                            "start_time": (
                                activity["start_time"].strftime("%Y-%m-%d %H:%M")
                                if hasattr(activity["start_time"], "strftime")
                                else str(activity["start_time"])
                            ),
                            "end_time": (
                                activity["end_time"].strftime("%Y-%m-%d %H:%M")
                                if hasattr(activity["end_time"], "strftime")
                                else str(activity["end_time"])
                            ),
                        }
                        for activity in activities
                    ],
                }
    except Exception as exc:
        print(f"Dashboard recent activity failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Unable to fetch recent activity.",
        ) from exc
