"use client";

import { useEffect, useState } from "react";

type ResourceStat = {
  total: number;
  active: number;
  inactive: number;
};

type UserStat = {
  total: number;
  byRole: Record<string, number>;
};

type AssignmentStat = {
  total: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  resourcesWithBookings: number;
  averageBookingDurationMinutes: number;
};

type RecentActivity = {
  booking_id: string;
  status: string;
  user_name: string;
  resource_name: string;
  start_time: string;
  end_time: string;
};

type DashboardData = {
  resources: ResourceStat;
  users: UserStat;
  assignments: AssignmentStat;
  recentActivity: RecentActivity[];
};

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/dashboard", {
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Unable to fetch dashboard data.");
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong."
        );
      } finally {
        setLoading(false);
      }
    }

    void fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0a0e17] text-slate-100 flex items-center justify-center p-8">
        <div className="rounded-xl bg-slate-800 p-8 text-center border border-slate-700">
          <div className="skeleton h-16 w-48 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading dashboard...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#0a0e17] text-slate-100 flex items-center justify-center p-8">
        <div className="mx-auto max-w-2xl p-6 text-center">
          <p className="rounded-xl bg-error/10 border border-error p-4 text-sm text-error mb-4">
            {error}
          </p>
          <button
            onClick={() => {
              setError("");
              setLoading(true);
            }}
            className="btn btn-primary mt-4"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!data) {
    return null;
  }

  const resources = data.resources ?? { total: 0, active: 0, inactive: 0 };
  const users = data.users ?? { total: 0, byRole: {} };
  const assignments = data.assignments ?? {
    total: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    resourcesWithBookings: 0,
    averageBookingDurationMinutes: 0,
  };
  const recentActivity = data.recentActivity ?? [];

  return (
    <main className="min-h-screen bg-[#0a0e17] text-slate-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Resources Card */}
          <article className="rounded-xl bg-slate-800 border border-slate-500/20 p-6 hover:bg-slate-700 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-primary"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-slate-400">Total Resources</p>
                <p className="text-3xl font-bold text-primary">{resources.total}</p>
                <p className="text-sm text-slate-500">Active: {resources.active} | Inactive: {resources.inactive}</p>
              </div>
            </div>
          </article>

          {/* Users Card */}
          <article className="rounded-xl bg-slate-800 border border-slate-500/20 p-6 hover:bg-slate-700 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-success"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 22c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-slate-400">Total Users</p>
                <p className="text-3xl font-bold text-primary">{users.total}</p>
                <p className="text-sm text-slate-500">
                  {Object.entries(users.byRole)
                    .map(([role, count]) => `${role}: ${count}`)
                    .join(", ")}
                </p>
              </div>
            </div>
          </article>

          {/* Assignments Card */}
          <article className="rounded-xl bg-slate-800 border border-slate-500/20 p-6 hover:bg-slate-700 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-warning"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 10c-2.21 0-4 1.79-4 4v2h8v-2c0-2.21-1.79-4-4-4z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-slate-400">Bookings</p>
                <p className="text-3xl font-bold text-primary">{assignments.total}</p>
                <p className="text-sm text-slate-500">
                  Confirmed: {assignments.confirmed} | Pending: {assignments.pending} | Cancelled: {assignments.cancelled}
                </p>
                <p className="text-xs text-slate-500">Resources with bookings: {assignments.resourcesWithBookings}</p>
                <p className="text-xs text-slate-500">Avg duration: {formatDuration(assignments.averageBookingDurationMinutes)}</p>
              </div>
            </div>
          </article>

          {/* Activity Card */}
          <article className="rounded-xl bg-slate-800 border border-slate-500/20 p-6 hover:bg-slate-700 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-primary"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-slate-400">Recent Activity</p>
                <p className="text-3xl font-bold text-primary">{recentActivity.length} items</p>
                <p className="text-sm text-slate-500">Latest updates</p>
              </div>
            </div>
          </article>
        </div>

        {/* Recent Activity Table */}
        <section className="mt-8 rounded-xl bg-slate-800 border border-slate-500/20 p-6">
          <h2 className="text-xl font-bold mb-4">Recent Activity</h2>

          {recentActivity.length === 0 ? (
            <p className="text-slate-400">No recent activity.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-slate-400 border-b border-slate-500/20">
                    <th>Resource</th>
                    <th>User</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.map((activity) => (
                    <tr key={activity.booking_id} className="border-b border-slate-500/10">
                      <td className="font-medium">{activity.resource_name}</td>
                      <td>{activity.user_name}</td>
                      <td>
                        <span
                          className={`px-2 py-1 rounded text-xs ${activity.status === "confirmed" ? "bg-primary/10 text-primary" : activity.status === "pending" ? "bg-warning/10 text-warning" : "bg-error/10 text-error"}`}
                        >
                          {activity.status}
                        </span>
                      </td>
                      <td>
                        <div className="text-xs text-slate-400">
                          {activity.start_time} – {activity.end_time}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}