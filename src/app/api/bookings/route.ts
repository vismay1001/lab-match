
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
          c.name AS category,
          b.start_time,
          b.end_time,
          b.status,
          b.created_at
       FROM bookings b
       JOIN users u ON u.user_id = b.user_id
       JOIN resources r ON r.resource_id = b.resource_id
       JOIN categories c ON c.category_id = r.category_id
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
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must contain valid JSON." },
      { status: 400 }
    );
  }

  try {
    const userId = Number(body.userId);
    const resourceId = Number(body.resourceId);
    const startTime = body.startTime;
    const endTime = body.endTime;

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

    const result = await pool.query(
      `INSERT INTO bookings
         (user_id, resource_id, start_time, end_time, status)
       SELECT u.user_id, r.resource_id, $3, $4, 'confirmed'
       FROM users u
       JOIN resources r ON r.resource_id = $2
       WHERE u.user_id = $1
         AND r.is_active = TRUE
       RETURNING booking_id, user_id, resource_id,
                 start_time, end_time, status, created_at`,
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

    if (dbError.code === "23P01") {
      return NextResponse.json(
        { error: "This resource is already booked for that time slot." },
        { status: 409 }
      );
    }

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

export async function PATCH(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must contain valid JSON." },
      { status: 400 }
    );
  }

  const bookingId = Number(body.bookingId);
  const userId = Number(body.userId);

  if (
    !Number.isSafeInteger(bookingId) ||
    bookingId <= 0 ||
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
    return NextResponse.json(
      { error: "Valid booking ID and user ID are required." },
      { status: 400 }
    );
  }

  try {
    const result = await pool.query(
      `UPDATE bookings
       SET status = 'cancelled'
       WHERE booking_id = $1
         AND user_id = $2
         AND status IN ('pending', 'confirmed')
       RETURNING booking_id, user_id, resource_id,
                 start_time, end_time, status`,
      [bookingId, userId]
    );

    if (result.rowCount === 0) {
      const existing = await pool.query(
        `SELECT status
         FROM bookings
         WHERE booking_id = $1
           AND user_id = $2`,
        [bookingId, userId]
      );

      if (existing.rowCount === 0) {
        return NextResponse.json(
          { error: "Booking not found for this user." },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          error: `This booking cannot be cancelled because its status is '${existing.rows[0].status}'.`,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      message: "Booking cancelled successfully.",
      booking: result.rows[0],
    });
  } catch (error) {
    console.error("Booking cancellation failed:", error);

    return NextResponse.json(
      { error: "Unable to cancel booking." },
      { status: 500 }
    );
  }
}
