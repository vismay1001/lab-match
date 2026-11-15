import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get("endpoint");

    switch (endpoint) {
      case "resources": {
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
          (acc: any, row: any) => {
            acc[row.name] = row.count;
            return acc;
          },
          {}
        );

        return NextResponse.json({
          success: true,
          totalResources: result.rows[0].count,
          activeResources: activeResult.rows[0].count,
          inactiveResources: inactiveResult.rows[0].count,
          resourcesByCategory,
        });
      }

      case "users": {
        const result = await pool.query("SELECT COUNT(*) as count FROM users");
        const roleResult = await pool.query(
          "SELECT role, COUNT(*) as count FROM users GROUP BY role"
        );

        const usersByRole = roleResult.rows.reduce(
          (acc: any, row: any) => {
            acc[row.role] = row.count;
            return acc;
          },
          {}
        );

        return NextResponse.json({
          success: true,
          totalUsers: result.rows[0].count,
          usersByRole,
        });
      }

      case "assignments": {
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
          avgResult.rows[0].avg_minutes !== null
            ? Math.round(parseFloat(avgResult.rows[0].avg_minutes))
            : 0;

        return NextResponse.json({
          success: true,
          totalBookings: totalResult.rows[0].count,
          confirmedBookings: confirmedResult.rows[0].count,
          pendingBookings: pendingResult.rows[0].count,
          cancelledBookings: cancelledResult.rows[0].count,
          resourcesWithBookings: resourcesResult.rows[0].resources_with_bookings,
          averageBookingDurationMinutes: avgMinutes,
        });
      }

      case "recent-activity": {
        const result = await pool.query(
          "SELECT b.booking_id, b.status, b.start_time, b.end_time, u.name as user_name, r.name as resource_name FROM bookings b JOIN users u ON u.user_id = b.user_id JOIN resources r ON r.resource_id = b.resource_id WHERE b.status IN ('pending', 'confirmed') ORDER BY b.created_at DESC LIMIT 5"
        );

        const activities = result.rows.map((row: any) => ({
          booking_id: String(row.booking_id),
          status: row.status,
          user_name: row.user_name,
          resource_name: row.resource_name,
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

      default:
        return NextResponse.json(
          { success: false, message: "Invalid endpoint" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { success: false, message: "Unable to fetch dashboard data." },
      { status: 500 }
    );
  }
}