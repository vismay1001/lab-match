
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    const query = `
      SELECT
        r.resource_id,
        r.name,
        c.name AS category,
        r.description,
        r.is_active,
        r.created_at
      FROM resources r
      JOIN categories c
        ON c.category_id = r.category_id
      WHERE r.is_active = TRUE
        AND ($1::text IS NULL OR c.name = $1)
      ORDER BY c.name, r.name;
    `;

    const result = await pool.query(query, [category]);

    return NextResponse.json({
      success: true,
      count: result.rowCount,
      resources: result.rows,
    });
  } catch (error) {
    console.error("Failed to retrieve resources:", error);

    return NextResponse.json(
      { error: "Unable to retrieve resources." },
      { status: 500 }
    );
  }
}
