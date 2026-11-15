"use client";

import { useEffect, useState } from "react";

type Booking = {
  booking_id: number | string;
  user_id: number | string;
  user_name: string;
  resource_id: number | string;
  resource_name: string;
  category: string;
  start_time: string;
  end_time: string;
  status: "pending" | "confirmed" | "cancelled" | string;
  created_at?: string;
};

type ApiResponse = {
  error?: string;
  message?: string;
  count?: number;
  bookings?: Booking[];
  booking?: Booking;
};

export default function MyBookingsPage() {
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("labmatch_user");
    if (!raw) {
      window.location.href = "/login";
      return;
    }
    try {
      const user = JSON.parse(raw) as { user_id?: number; name?: string };
      if (!user.user_id) throw new Error("Invalid user");
      setUserId(String(user.user_id));
      setUserName(user.name || "");
    } catch {
      localStorage.removeItem("labmatch_user");
      window.location.href = "/login";
    }
  }, []);

  useEffect(() => {
    if (userId) void loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadBookings() {
    setLoading(true);
    setError("");
    setNotice("");

    try {
      if (!/^[1-9]\d*$/.test(userId)) {
        throw new Error("Enter a valid positive user ID.");
      }

      const response = await fetch(
        `/api/bookings?userId=${encodeURIComponent(userId)}`
      );

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load bookings.");
      }

      setBookings(data.bookings ?? []);
    } catch (err) {
      setBookings([]);
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  async function cancelBooking(booking: Booking) {
    const confirmed = window.confirm(
      `Cancel booking #${booking.booking_id} for ${booking.resource_name}?`
    );

    if (!confirmed) return;

    const bookingId = String(booking.booking_id);

    setCancellingId(bookingId);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/bookings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookingId: booking.booking_id,
          userId: Number(userId),
        }),
      });

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not cancel booking.");
      }

      setBookings((currentBookings) =>
        currentBookings.map((item) =>
          String(item.booking_id) === bookingId
            ? { ...item, status: "cancelled" }
            : item
        )
      );

      setNotice(`Booking #${bookingId} was cancelled successfully.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong while cancelling."
      );
    } finally {
      setCancellingId(null);
    }
  }

  function formatDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function statusStyle(status: string) {
    switch (status) {
      case "confirmed":
        return "border-primary bg-primary/15 text-primary";
      case "cancelled":
        return "border-error bg-error/15 text-error";
      case "pending":
        return "border-warning bg-warning/15 text-warning";
      default:
        return "border-slate-500 text-slate-400";
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0e17] text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white md:hidden">
            Lab<span className="text-primary">Match</span>
          </a>
          <h1 className="text-xl font-semibold text-white hidden md:block">My Bookings</h1>
        </div>

        <nav>
          <a
            href="/"
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:border-primary hover:text-white transition"
          >
            Browse resources
          </a>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <p className="mb-3 text-sm font-medium uppercase tracking-wider text-primary">
          Reservation management
        </p>

        <h1 className="mt-3 text-4xl font-bold tracking-tight">
          My Bookings
        </h1>

        <p className="mt-3 max-w-2xl text-slate-400">
          View your resource reservations and cancel bookings
          that are still pending or confirmed.
        </p>

        <p className="mt-3 text-slate-400">
          {userName ? `Reservations for ${userName}. ` : ""}
          Your bookings are loaded automatically.
        </p>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => void loadBookings()}
            disabled={loading || !userId}
            className="btn btn-primary rounded-lg px-5 py-3 font-semibold text-slate-950 transition hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Loading..." : "Refresh bookings"}
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl bg-error/10 border border-error p-4 text-sm text-error"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mt-4 rounded-xl bg-success/10 border border-success p-4 text-sm text-success"
          >
            {notice}
          </div>
        )}

        <div className="mt-4 mb-8">
          <h2 className="text-lg font-semibold">Reservation history</h2>

          <span className="text-sm text-slate-400">
            {bookings.length} bookings
          </span>
        </div>

        {loading && !error ? (
          <div className="rounded-xl bg-slate-800 p-8 text-center">
            <p className="text-slate-400">Loading bookings...</p>
          </div>
        ) : error ? (
          <div className="rounded-xl bg-error/10 border border-error p-4 text-sm text-error">
            {error}
          </div>
        ) : bookings.length === 0 ? (
          <div className="rounded-xl bg-slate-800 p-8 text-center">
            <h3 className="font-semibold">No bookings to display</h3>
            <p className="mt-2 text-sm text-slate-400">
              You have no reservations yet. Browse resources to make your first booking.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {bookings.map((booking) => (
              <article
                key={booking.booking_id}
                className="rounded-xl bg-slate-800 border border-slate-500/20 p-6 sm:p-8 hover:bg-slate-700 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
                  <div>
                    <p className="text-xs text-slate-400">
                      Booking #{booking.booking_id}
                    </p>

                    <h3 className="mt-2 text-xl font-semibold">
                      {booking.resource_name}
                    </h3>

                    <p className="mt-1 text-sm text-primary">
                      {booking.category}
                    </p>
                  </div>

                  <span
                    className={`w-fit rounded-full border px-3 py-1 text-xs font-medium capitalize text-slate-400 capitalize ${statusStyle(
                      booking.status
                    )}`}
                  >
                    {booking.status}
                  </span>
                </div>

                <div className="mt-4 sm:grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-400">Start time</p>
                    <p className="mt-1 text-sm">
                      {formatDate(booking.start_time)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">End time</p>
                    <p className="mt-1 text-sm">
                      {formatDate(booking.end_time)}
                    </p>
                  </div>
                </div>

                {booking.status === "pending" || booking.status === "confirmed" ? (
                  <div className="mt-4 flex justify-end border-t border-slate-500/20 pt-4">
                    <button
                      type="button"
                      onClick={() => void cancelBooking(booking)}
                      disabled={cancellingId === String(booking.booking_id)}
                      className="btn btn-danger rounded-lg px-4 py-2 text-sm font-medium text-error transition hover:bg-error/80 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {cancellingId === String(booking.booking_id)
                        ? "Cancelling..."
                        : "Cancel booking"}
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}