
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const category = searchParams.get("category");

    const query = `
      SELECT
        resource_id,
        name,
        category,
        description,
        is_active,
        created_at
      FROM resources
      WHERE is_active = TRUE
        AND ($1::text IS NULL OR category = $1)
      ORDER BY category, name;
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
