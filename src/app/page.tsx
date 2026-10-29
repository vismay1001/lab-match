
"use client";

import { useEffect, useState, type FormEvent } from "react";

type Resource = {
  resource_id: number;
  name: string;
  category: string;
  description: string;
  is_active: boolean;
  created_at: string;
};

type BookingResponse = {
  message?: string;
  error?: string;
  booking?: {
    booking_id: number;
  };
};

export default function Home() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedResource, setSelectedResource] =
    useState<Resource | null>(null);
  const [userId, setUserId] = useState("1");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState("");

  useEffect(() => {
    async function fetchResources() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/resources");

        if (!response.ok) {
          throw new Error("Could not load resources.");
        }

        const data = await response.json();
        setResources(data.resources);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong."
        );
      } finally {
        setLoading(false);
      }
    }

    fetchResources();
  }, []);

  const categories = [
    "All",
    ...new Set(resources.map((resource) => resource.category)),
  ];

  const filteredResources =
    category === "All"
      ? resources
      : resources.filter(
          (resource) => resource.category === category
        );

  function openBookingForm(resource: Resource) {
    setSelectedResource(resource);
    setBookingError("");
    setBookingSuccess("");
    setStartTime("");
    setEndTime("");
  }

  async function handleBookingSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!selectedResource) return;

    setBookingLoading(true);
    setBookingError("");
    setBookingSuccess("");

    try {
      const start = new Date(startTime);
      const end = new Date(endTime);

      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end.getTime() <= start.getTime()
      ) {
        throw new Error(
          "Please select a valid time range. End time must be after start time."
        );
      }

      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: Number(userId),
          resourceId: selectedResource.resource_id,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        }),
      });

      const data: BookingResponse = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to create booking."
        );
      }

      setBookingSuccess(
        `Booking confirmed! Booking ID: ${data.booking?.booking_id ?? "Created"}`
      );
      setSelectedResource(null);
    } catch (err) {
      setBookingError(
        err instanceof Error
          ? err.message
          : "Something went wrong while booking."
      );
    } finally {
      setBookingLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">
            Lab<span className="text-cyan-400">Match</span>
          </h1>
          <span className="text-sm text-slate-400">
            University Resource Portal
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-cyan-400">
          Shared campus resources
        </p>

        <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Find your next
          <br />
          <span className="text-slate-400">workspace.</span>
        </h2>

        <p className="mt-4 max-w-2xl text-slate-400">
          Explore workstations, 3D printers and cameras.
          Find the right equipment for your project.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          {categories.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                category === item
                  ? "border-cyan-400 bg-cyan-400 text-slate-950"
                  : "border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {bookingSuccess && (
          <div className="mt-6 rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-emerald-300">
            {bookingSuccess}
          </div>
        )}

        <div className="mb-5 mt-8 flex items-center justify-between">
          <h3 className="text-xl font-semibold">
            Available resources
          </h3>
          <span className="text-sm text-slate-400">
            {filteredResources.length} resources
          </span>
        </div>

        {loading ? (
          <p className="py-10 text-slate-400">
            Loading resources from the database...
          </p>
        ) : error ? (
          <div className="rounded-xl border border-red-900 bg-red-950/40 p-5 text-red-300">
            {error}
          </div>
        ) : filteredResources.length === 0 ? (
          <div className="rounded-xl border border-slate-800 p-8 text-slate-400">
            No resources found in this category.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredResources.map((resource) => (
              <article
                key={resource.resource_id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-cyan-500/60"
              >
                <div className="mb-5 flex items-start justify-between gap-3">
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-cyan-300">
                    {resource.category}
                  </span>
                  <span className="text-xs text-emerald-400">
                    Active
                  </span>
                </div>

                <h4 className="text-lg font-semibold">
                  {resource.name}
                </h4>

                <p className="mt-3 min-h-16 text-sm leading-6 text-slate-400">
                  {resource.description}
                </p>

                <div className="mt-6 border-t border-slate-800 pt-4">
                  <p className="text-xs text-slate-500">
                    Resource ID: {resource.resource_id}
                  </p>

                  <button
                    onClick={() => openBookingForm(resource)}
                    className="mt-4 w-full rounded-lg bg-cyan-400 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-cyan-300"
                  >
                    Book resource
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-title"
            className="my-auto w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-cyan-400">
                  Resource reservation
                </p>
                <h3
                  id="booking-title"
                  className="mt-1 text-2xl font-bold"
                >
                  {selectedResource.name}
                </h3>
                <p className="mt-2 text-sm text-slate-400">
                  {selectedResource.category}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedResource(null)}
                className="rounded-lg px-3 py-1 text-xl text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Close booking form"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleBookingSubmit}
              className="mt-6 space-y-5"
            >
              <div>
                <label
                  htmlFor="userId"
                  className="mb-2 block text-sm font-medium"
                >
                  User ID
                </label>
                <input
                  id="userId"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-400"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Demo only: use an existing user ID from the users table.
                </p>
              </div>

              <div>
                <label
                  htmlFor="startTime"
                  className="mb-2 block text-sm font-medium"
                >
                  Start time
                </label>
                <input
                  id="startTime"
                  type="datetime-local"
                  required
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label
                  htmlFor="endTime"
                  className="mb-2 block text-sm font-medium"
                >
                  End time
                </label>
                <input
                  id="endTime"
                  type="datetime-local"
                  required
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-400"
                />
              </div>

              {bookingError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300"
                >
                  {bookingError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedResource(null)}
                  disabled={bookingLoading}
                  className="flex-1 rounded-lg border border-slate-700 px-4 py-3 font-medium hover:bg-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={bookingLoading}
                  className="flex-1 rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bookingLoading ? "Booking..." : "Confirm booking"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
