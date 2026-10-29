
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

type DatabaseError = Error & {
  code?: string;
  constraint?: string;
};

function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof Error && "code" in error;
}

function getBookingConflictResponse(error: unknown) {
  if (!isDatabaseError(error) || error.code !== "23P01") {
    return null;
  }

  if (error.constraint === "no_overlapping_user_bookings") {
    return NextResponse.json(
      {
        error:
          "You already have another booking during this time slot.",
        code: "USER_BOOKING_CONFLICT",
      },
      { status: 409 }
    );
  }

  if (error.constraint === "no_overlapping_active_bookings") {
    return NextResponse.json(
      {
        error:
          "This resource is already booked for that time slot.",
        code: "RESOURCE_BOOKING_CONFLICT",
      },
      { status: 409 }
    );
  }

  return NextResponse.json(
    {
      error: "This booking conflicts with an existing booking.",
      code: "BOOKING_CONFLICT",
    },
    { status: 409 }
  );
}

// GET /api/bookings?userId=2
// Retrieve bookings for a particular user.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId || !/^\d+$/.test(userId) || Number(userId) <= 0) {
      return NextResponse.json(
        { error: "A valid userId is required." },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
        SELECT
          b.booking_id,
          b.user_id,
          u.name AS user_name,
          b.resource_id,
          r.name AS resource_name,
          c.name AS category,
          r.description AS resource_description,
          b.start_time,
          b.end_time,
          b.status,
          b.created_at
        FROM bookings b
        JOIN users u
          ON u.user_id = b.user_id
        JOIN resources r
          ON r.resource_id = b.resource_id
        JOIN categories c
          ON c.category_id = r.category_id
        WHERE b.user_id = $1
        ORDER BY b.start_time DESC;
      `,
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

// POST /api/bookings
// Create a booking, rejecting overlapping resource or user bookings.
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { userId, resourceId, startTime, endTime } = body;

    if (
      userId === undefined ||
      resourceId === undefined ||
      !/^\d+$/.test(String(userId)) ||
      !/^\d+$/.test(String(resourceId)) ||
      Number(userId) <= 0 ||
      Number(resourceId) <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Valid userId and resourceId values are required.",
        },
        { status: 400 }
      );
    }

    if (
      typeof startTime !== "string" ||
      typeof endTime !== "string" ||
      startTime.trim() === "" ||
      endTime.trim() === ""
    ) {
      return NextResponse.json(
        { error: "Valid startTime and endTime values are required." },
        { status: 400 }
      );
    }

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      return NextResponse.json(
        { error: "The booking dates are invalid." },
        { status: 400 }
      );
    }

    if (endDate <= startDate) {
      return NextResponse.json(
        { error: "endTime must be later than startTime." },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
        INSERT INTO bookings (
          user_id,
          resource_id,
          start_time,
          end_time,
          status
        )
        SELECT
          u.user_id,
          r.resource_id,
          $3::timestamptz,
          $4::timestamptz,
          'confirmed'
        FROM users u
        CROSS JOIN resources r
        WHERE u.user_id = $1
          AND r.resource_id = $2
          AND r.is_active = TRUE
        RETURNING
          booking_id,
          user_id,
          resource_id,
          start_time,
          end_time,
          status,
          created_at;
      `,
      [
        Number(userId),
        Number(resourceId),
        startDate.toISOString(),
        endDate.toISOString(),
      ]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        {
          error:
            "The specified user or active resource was not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Booking created successfully.",
        booking: result.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    const conflictResponse = getBookingConflictResponse(error);

    if (conflictResponse) {
      return conflictResponse;
    }

    if (isDatabaseError(error) && error.code === "23503") {
      return NextResponse.json(
        {
          error: "The specified user or resource does not exist.",
        },
        { status: 400 }
      );
    }

    console.error("Failed to create booking:", error);

    return NextResponse.json(
      { error: "Unable to create booking." },
      { status: 500 }
    );
  }
}

// PATCH /api/bookings
// Cancel a booking belonging to the specified user.
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { bookingId, userId } = body;

    if (
      bookingId === undefined ||
      userId === undefined ||
      !/^\d+$/.test(String(bookingId)) ||
      !/^\d+$/.test(String(userId)) ||
      Number(bookingId) <= 0 ||
      Number(userId) <= 0
    ) {
      return NextResponse.json(
        {
          error: "Valid bookingId and userId values are required.",
        },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
        UPDATE bookings
        SET status = 'cancelled'
        WHERE booking_id = $1
          AND user_id = $2
          AND status IN ('pending', 'confirmed')
        RETURNING
          booking_id,
          user_id,
          resource_id,
          start_time,
          end_time,
          status,
          created_at;
      `,
      [Number(bookingId), Number(userId)]
    );

    if (result.rowCount === 0) {
      const existingBooking = await pool.query(
        `
          SELECT booking_id, status
          FROM bookings
          WHERE booking_id = $1
            AND user_id = $2;
        `,
        [Number(bookingId), Number(userId)]
      );

      if (existingBooking.rowCount === 0) {
        return NextResponse.json(
          {
            error:
              "Booking not found, or it does not belong to this user.",
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          error: "This booking has already been cancelled.",
          booking: existingBooking.rows[0],
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Booking cancelled successfully.",
      booking: result.rows[0],
    });
  } catch (error) {
    console.error("Failed to cancel booking:", error);

    return NextResponse.json(
      { error: "Unable to cancel booking." },
      { status: 500 }
    );
  }
}
