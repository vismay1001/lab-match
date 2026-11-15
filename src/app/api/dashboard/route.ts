import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoints = searchParams.getAll("endpoint");
    const singleEndpoint = endpoints.length === 1 ? endpoints[0] : null;

    // Handle single endpoint queries if explicitly requested
    if (singleEndpoint === "resources") {
      const result = await pool.query("SELECT COUNT(*) as count FROM resources");
      const activeResult = await pool.query(
        "SELECT COUNT(*) as count FROM resources WHERE is_active = TRUE"
      );
      const inactiveResult = await pool.query(
        "SELECT COUNT(*) as count FROM resources WHERE is_active = FALSE"
      );
      const catResult = await pool.query(
        "SELECT c.name as name, COUNT(r.resource_id) as count FROM resources r JOIN categories c ON c.category_id = r.category_id GROUP BY c.name ORDER BY count DESC"
      );

      const resourcesByCategory = catResult.rows.reduce(
        (acc: Record<string, number>, row: { name: string; count: string | number }) => {
          acc[row.name] = Number(row.count);
          return acc;
        },
        {}
      );

      return NextResponse.json({
        success: true,
        totalResources: Number(result.rows[0]?.count ?? 0),
        activeResources: Number(activeResult.rows[0]?.count ?? 0),
        inactiveResources: Number(inactiveResult.rows[0]?.count ?? 0),
        resourcesByCategory,
      });
    }

    if (singleEndpoint === "users") {
      const result = await pool.query("SELECT COUNT(*) as count FROM users");
      const roleResult = await pool.query(
        "SELECT role, COUNT(*) as count FROM users GROUP BY role"
      );

      const usersByRole = roleResult.rows.reduce(
        (acc: Record<string, number>, row: { role: string; count: string | number }) => {
          acc[row.role] = Number(row.count);
          return acc;
        },
        {}
      );

      return NextResponse.json({
        success: true,
        totalUsers: Number(result.rows[0]?.count ?? 0),
        usersByRole,
      });
    }

    if (singleEndpoint === "assignments") {
      const totalResult = await pool.query("SELECT COUNT(*) as count FROM bookings");
      const confirmedResult = await pool.query(
        "SELECT COUNT(*) as count FROM bookings WHERE status = 'confirmed'"
      );
      const pendingResult = await pool.query(
        "SELECT COUNT(*) as count FROM bookings WHERE status = 'pending'"
      );
      const cancelledResult = await pool.query(
        "SELECT COUNT(*) as count FROM bookings WHERE status = 'cancelled'"
      );
      const resourcesResult = await pool.query(
        "SELECT COUNT(DISTINCT resource_id) as resources_with_bookings FROM bookings WHERE status IN ('pending', 'confirmed')"
      );
      const avgResult = await pool.query(
        "SELECT AVG(EXTRACT(EPOCH FROM (end_time - start_time))) / 60 as avg_minutes FROM bookings WHERE status IN ('pending', 'confirmed')"
      );

      const avgMinutes =
        avgResult.rows[0]?.avg_minutes != null
          ? Math.round(parseFloat(avgResult.rows[0].avg_minutes))
          : 0;

      return NextResponse.json({
        success: true,
        totalBookings: Number(totalResult.rows[0]?.count ?? 0),
        confirmedBookings: Number(confirmedResult.rows[0]?.count ?? 0),
        pendingBookings: Number(pendingResult.rows[0]?.count ?? 0),
        cancelledBookings: Number(cancelledResult.rows[0]?.count ?? 0),
        resourcesWithBookings: Number(resourcesResult.rows[0]?.resources_with_bookings ?? 0),
        averageBookingDurationMinutes: avgMinutes,
      });
    }

    if (singleEndpoint === "recent-activity") {
      const result = await pool.query(
        "SELECT b.booking_id, b.status, b.start_time, b.end_time, u.name as user_name, r.name as resource_name FROM bookings b JOIN users u ON u.user_id = b.user_id JOIN resources r ON r.resource_id = b.resource_id WHERE b.status IN ('pending', 'confirmed') ORDER BY b.created_at DESC LIMIT 5"
      );

      const activities = result.rows.map((row: {
        booking_id: number | string;
        status: string;
        user_name?: string;
        resource_name?: string;
        start_time: Date | string;
        end_time: Date | string;
      }) => ({
        booking_id: String(row.booking_id),
        status: row.status,
        user_name: row.user_name ?? "Unknown",
        resource_name: row.resource_name ?? "Unknown",
        start_time:
          row.start_time instanceof Date
            ? row.start_time.toLocaleString()
            : String(row.start_time),
        end_time:
          row.end_time instanceof Date
            ? row.end_time.toLocaleString()
            : String(row.end_time),
      }));

      return NextResponse.json({
        success: true,
        recentActivity: activities,
      });
    }

    // Default: Return the full aggregate dashboard data
    const [
      resTotal,
      resActive,
      resInactive,
      usersTotal,
      usersRole,
      assignTotal,
      assignConfirmed,
      assignPending,
      assignCancelled,
      assignUniqueResources,
      assignAvg,
      recentAct,
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM resources"),
      pool.query("SELECT COUNT(*) as count FROM resources WHERE is_active = TRUE"),
      pool.query("SELECT COUNT(*) as count FROM resources WHERE is_active = FALSE"),
      pool.query("SELECT COUNT(*) as count FROM users"),
      pool.query("SELECT role, COUNT(*) as count FROM users GROUP BY role"),
      pool.query("SELECT COUNT(*) as count FROM bookings"),
      pool.query("SELECT COUNT(*) as count FROM bookings WHERE status = 'confirmed'"),
      pool.query("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending'"),
      pool.query("SELECT COUNT(*) as count FROM bookings WHERE status = 'cancelled'"),
      pool.query("SELECT COUNT(DISTINCT resource_id) as resources_with_bookings FROM bookings WHERE status IN ('pending', 'confirmed')"),
      pool.query("SELECT AVG(EXTRACT(EPOCH FROM (end_time - start_time))) / 60 as avg_minutes FROM bookings WHERE status IN ('pending', 'confirmed')"),
      pool.query(
        "SELECT b.booking_id, b.status, b.start_time, b.end_time, u.name as user_name, r.name as resource_name FROM bookings b JOIN users u ON u.user_id = b.user_id JOIN resources r ON r.resource_id = b.resource_id WHERE b.status IN ('pending', 'confirmed') ORDER BY b.created_at DESC LIMIT 5"
      ),
    ]);

    const usersByRole = usersRole.rows.reduce(
      (acc: Record<string, number>, row: { role: string; count: string | number }) => {
        acc[row.role] = Number(row.count);
        return acc;
      },
      {}
    );

    const avgMinutes =
      assignAvg.rows[0]?.avg_minutes != null
        ? Math.round(parseFloat(assignAvg.rows[0].avg_minutes))
        : 0;

    const recentActivity = recentAct.rows.map((row: {
      booking_id: number | string;
      status: string;
      user_name?: string;
      resource_name?: string;
      start_time: Date | string;
      end_time: Date | string;
    }) => ({
      booking_id: String(row.booking_id),
      status: row.status,
      user_name: row.user_name ?? "Unknown",
      resource_name: row.resource_name ?? "Unknown",
      start_time:
        row.start_time instanceof Date
          ? row.start_time.toLocaleString()
          : String(row.start_time),
      end_time:
        row.end_time instanceof Date
          ? row.end_time.toLocaleString()
          : String(row.end_time),
    }));

    return NextResponse.json({
      success: true,
      resources: {
        total: Number(resTotal.rows[0]?.count ?? 0),
        active: Number(resActive.rows[0]?.count ?? 0),
        inactive: Number(resInactive.rows[0]?.count ?? 0),
      },
      users: {
        total: Number(usersTotal.rows[0]?.count ?? 0),
        byRole: usersByRole,
      },
      assignments: {
        total: Number(assignTotal.rows[0]?.count ?? 0),
        confirmed: Number(assignConfirmed.rows[0]?.count ?? 0),
        pending: Number(assignPending.rows[0]?.count ?? 0),
        cancelled: Number(assignCancelled.rows[0]?.count ?? 0),
        resourcesWithBookings: Number(assignUniqueResources.rows[0]?.resources_with_bookings ?? 0),
        averageBookingDurationMinutes: avgMinutes,
      },
      recentActivity,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { success: false, message: "Unable to fetch dashboard data." },
      { status: 500 }
    );
  }
}