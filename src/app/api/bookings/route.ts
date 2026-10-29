
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get("userId");

    if (!userIdParam || !/^[1-9]\d*$/.test(userIdParam)) {
      return NextResponse.json(
        { error: "A valid userId is required." },
        { status: 400 }
      );
    }

    const userId = Number(userIdParam);

    if (!Number.isSafeInteger(userId)) {
      return NextResponse.json(
        { error: "Invalid userId." },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `SELECT
          b.booking_id,
          b.user_id,
          u.name AS user_name,
          b.resource_id,
          r.name AS resource_name,
          r.category,
          b.start_time,
          b.end_time,
          b.status,
          b.created_at
       FROM bookings b
       JOIN users u ON u.user_id = b.user_id
       JOIN resources r ON r.resource_id = b.resource_id
       WHERE b.user_id = $1
       ORDER BY b.start_time DESC`,
      [userId]
    );

    return NextResponse.json({
      success: true,
      count: result.rowCount,
      bookings: result.rows,
    });
  } catch (error) {
    console.error("Failed to retrieve bookings:", error);

    return NextResponse.json(
      { error: "Unable to retrieve bookings." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const userId = Number(body.userId);
    const resourceId = Number(body.resourceId);
    const startTime = body.startTime;
    const endTime = body.endTime;

    // Validate IDs.
    if (
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      !Number.isSafeInteger(resourceId) ||
      resourceId <= 0
    ) {
      return NextResponse.json(
        { error: "User ID and resource ID must be positive integers." },
        { status: 400 }
      );
    }

    // Validate timestamps.
    if (
      typeof startTime !== "string" ||
      typeof endTime !== "string" ||
      !startTime.trim() ||
      !endTime.trim()
    ) {
      return NextResponse.json(
        { error: "Start time and end time are required." },
        { status: 400 }
      );
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end.getTime() <= start.getTime()
    ) {
      return NextResponse.json(
        { error: "Invalid time range. End time must be after start time." },
        { status: 400 }
      );
    }

    // Insert the booking using parameterized SQL.
    const result = await pool.query(
      `INSERT INTO bookings
         (user_id, resource_id, start_time, end_time, status)
       SELECT u.user_id, r.resource_id, $3, $4, 'confirmed'
       FROM users u
       JOIN resources r ON r.resource_id = $2
       WHERE u.user_id = $1
         AND r.is_active = TRUE
       RETURNING booking_id, user_id, resource_id,
                 start_time, end_time, status`,
      [userId, resourceId, start, end]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "User or active resource not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        message: "Booking created successfully.",
        booking: result.rows[0],
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const dbError = error as { code?: string };

    // PostgreSQL exclusion constraint violation.
    if (dbError.code === "23P01") {
      return NextResponse.json(
        { error: "This resource is already booked for that time slot." },
        { status: 409 }
      );
    }

    // PostgreSQL foreign key violation.
    if (dbError.code === "23503") {
      return NextResponse.json(
        { error: "The specified user or resource does not exist." },
        { status: 400 }
      );
    }

    console.error("Booking creation failed:", error);

    return NextResponse.json(
      { error: "Unable to create booking." },
      { status: 500 }
    );
  }
}
