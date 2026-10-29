
"use client";

import { useEffect, useState, type FormEvent } from "react";

const FASTAPI_URL =
  process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000";

type Resource = {
  resource_id: number;
  name: string;
  category: string;
  description: string;
  capabilities?: string;
  specifications?: Record<string, unknown>;
  is_active?: boolean;
};

type Recommendation = Resource & {
  similarity_distance?: number;
  recommendation_reason?: string;
};

type ApiResponse = {
  detail?: string;
  error?: string;
  code?: string;
  booking?: { booking_id: number };
  recommendations?: Recommendation[];
  workload_profile?: {
    name: string;
    minimum_vram_gb: number;
    reason: string;
    excluded_resources: string[];
  } | null;
};

function dateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeLabel(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function addMinutes(date: string, time: string, minutes: number) {
  const value = new Date(`${date}T${time}:00`);
  value.setMinutes(value.getMinutes() + minutes);
  return {
    date: dateString(value),
    time: `${String(value.getHours()).padStart(2, "0")}:${String(
      value.getMinutes()
    ).padStart(2, "0")}`,
  };
}

const TIMES = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";
  const value = `${String(hour).padStart(2, "0")}:${minute}`;
  return { value, label: timeLabel(value) };
});

export default function Home() {
  const today = dateString(new Date());

  const [resources, setResources] = useState<Resource[]>([]);
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [task, setTask] = useState("");
  const [userId, setUserId] = useState("");
  const [loggedInName, setLoggedInName] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("labmatch_user");
    if (!raw) return;
    try {
      const user = JSON.parse(raw) as { user_id?: number; name?: string };
      if (user.user_id) setUserId(String(user.user_id));
      if (user.name) setLoggedInName(user.name);
    } catch {
      localStorage.removeItem("labmatch_user");
    }
  }, []);
  const [startDate, setStartDate] = useState(today);
  const [startTime, setStartTime] = useState("10:00");
  const initialEnd = addMinutes(today, "10:00", 60);
  const [endDate, setEndDate] = useState(initialEnd.date);
  const [endTime, setEndTime] = useState(initialEnd.time);

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [profileMessage, setProfileMessage] = useState("");
  const [excludedResources, setExcludedResources] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const [bookingResource, setBookingResource] =
    useState<Recommendation | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const start = new Date(`${startDate}T${startTime}:00`);
  const end = new Date(`${endDate}T${endTime}:00`);
  const validRange =
    Number.isFinite(start.getTime()) &&
    Number.isFinite(end.getTime()) &&
    end.getTime() > start.getTime();

  useEffect(() => {
    async function loadResources() {
      try {
        const response = await fetch("/api/resources");
        if (!response.ok) throw new Error("Unable to load resources.");
        const data = await response.json();
        setResources(data.resources ?? []);
      } catch (err) {
        setPageError(
          err instanceof Error ? err.message : "Unable to load resources."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadResources();
  }, []);

  const categories = [
    "All",
    ...new Set(resources.map((resource) => resource.category)),
  ];

  const filteredResources =
    category === "All"
      ? resources
      : resources.filter((resource) => resource.category === category);

  function updateStartDate(value: string) {
    setStartDate(value);
    const currentStart = new Date(`${value}T${startTime}:00`);
    const currentEnd = new Date(`${endDate}T${endTime}:00`);

    if (
      Number.isFinite(currentStart.getTime()) &&
      Number.isFinite(currentEnd.getTime()) &&
      currentEnd <= currentStart
    ) {
      const next = addMinutes(value, startTime, 60);
      setEndDate(next.date);
      setEndTime(next.time);
    }
  }

  function updateStartTime(value: string) {
    setStartTime(value);
    const currentStart = new Date(`${startDate}T${value}:00`);
    const currentEnd = new Date(`${endDate}T${endTime}:00`);

    if (
      Number.isFinite(currentStart.getTime()) &&
      Number.isFinite(currentEnd.getTime()) &&
      currentEnd <= currentStart
    ) {
      const next = addMinutes(startDate, value, 60);
      setEndDate(next.date);
      setEndTime(next.time);
    }
  }

  function setDuration(minutes: number) {
    const next = addMinutes(startDate, startTime, minutes);
    setEndDate(next.date);
    setEndTime(next.time);
  }

  async function recommendResources(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (task.trim().length < 3) {
      setSearchError("Describe your task in a few words.");
      return;
    }

    if (!validRange) {
      setSearchError("End time must be later than start time.");
      return;
    }

    setSearching(true);
    setSearchError("");
    setProfileMessage("");
    setExcludedResources([]);
    setRecommendations([]);
    setHasSearched(false);
    setSuccessMessage("");

    try {
      const response = await fetch(`${FASTAPI_URL}/recommend-resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: task.trim(),
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          limit: 10,
        }),
      });

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Could not generate recommendations."
        );
      }

      setRecommendations(data.recommendations ?? []);

      if (data.workload_profile) {
        setProfileMessage(data.workload_profile.reason);
        setExcludedResources(
          data.workload_profile.excluded_resources ?? []
        );
      }

      if (!data.recommendations?.length) {
        setSearchError(
          "No eligible resources are available for this task and time slot. Try another time or a different task description."
        );
      }

      setHasSearched(true);
    } catch (err) {
      setSearchError(
        err instanceof Error
          ? err.message
          : "Could not connect to the recommendation service."
      );
    } finally {
      setSearching(false);
    }
  }

  function openBooking(resource: Recommendation) {
    setBookingResource(resource);
    setBookingError("");
  }

  async function confirmBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bookingResource) return;

    if (!userId) {
      window.location.href = "/login";
      return;
    }

    if (!validRange) {
      setBookingError("Choose a valid start and end time.");
      return;
    }

    setBookingLoading(true);
    setBookingError("");

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: Number(userId),
          resourceId: bookingResource.resource_id,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        }),
      });

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            (data.code === "USER_BOOKING_CONFLICT"
              ? "You already have a booking during this time."
              : "This resource is no longer available for that time.")
        );
      }

      setSuccessMessage(
        `Booking confirmed! Booking ID: ${data.booking?.booking_id ?? "Created"}`
      );
      setBookingResource(null);

      // Refresh recommendations because resource availability may have changed.
      setRecommendations((current) =>
        current.filter(
          (item) => item.resource_id !== bookingResource.resource_id
        )
      );
    } catch (err) {
      setBookingError(
        err instanceof Error ? err.message : "Booking failed."
      );
    } finally {
      setBookingLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <a href="/" className="text-2xl font-bold tracking-tight">
            Lab<span className="text-cyan-400">Match</span>
          </a>
          <div className="flex items-center gap-4">
            <a
              href="/bookings"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-cyan-400 hover:text-cyan-300"
            >
              My Bookings
            </a>
            {loggedInName ? (
              <>
                <span className="hidden text-sm text-slate-400 sm:inline">Hi, {loggedInName}</span>
                <button type="button" onClick={() => { localStorage.removeItem("labmatch_user"); window.location.href = "/login"; }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-cyan-400">Log out</button>
              </>
            ) : (
              <>
                <a href="/login" className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-cyan-400">Log in</a>
                <a href="/register" className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">Register</a>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-cyan-400">
          Intelligent campus resource booking
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          What are you
          <br />
          <span className="text-slate-400">planning to do?</span>
        </h1>
        <p className="mt-4 max-w-2xl text-slate-400">
          Describe your project. LabMatch matches your task against resource
          capabilities, filters unsuitable hardware, and checks availability.
        </p>

        <form
          onSubmit={recommendResources}
          className="mt-9 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-7"
        >
          <label htmlFor="task" className="mb-2 block font-medium">
            Describe your task
          </label>
          <textarea
            id="task"
            rows={3}
            maxLength={2000}
            required
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="Example: Train a CNN for image classification using PyTorch."
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-cyan-400"
          />

          <p className="mb-5 mt-2 text-xs text-slate-500">
            Examples: introductory ML, CNN training, LLM fine-tuning, 3D rendering.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="startDate" className="mb-2 block text-sm font-medium">
                Start date
              </label>
              <input
                id="startDate"
                type="date"
                min={today}
                required
                value={startDate}
                onChange={(event) => updateStartDate(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label htmlFor="startTime" className="mb-2 block text-sm font-medium">
                Start time
              </label>
              <select
                id="startTime"
                value={startTime}
                onChange={(event) => updateStartTime(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-cyan-400"
              >
                {TIMES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="endDate" className="mb-2 block text-sm font-medium">
                End date
              </label>
              <input
                id="endDate"
                type="date"
                min={startDate || today}
                required
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label htmlFor="endTime" className="mb-2 block text-sm font-medium">
                End time
              </label>
              <select
                id="endTime"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-cyan-400"
              >
                {TIMES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { label: "30 minutes", value: 30 },
              { label: "1 hour", value: 60 },
              { label: "2 hours", value: 120 },
            ].map((duration) => (
              <button
                key={duration.value}
                type="button"
                onClick={() => setDuration(duration.value)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-cyan-400 hover:text-cyan-300"
              >
                {duration.label}
              </button>
            ))}
          </div>

          {!validRange && (
            <p className="mt-3 text-sm text-amber-300">
              End time must be later than start time.
            </p>
          )}

          <button
            type="submit"
            disabled={searching || !validRange}
            className="mt-6 w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50 sm:w-auto"
          >
            {searching ? "Finding suitable resources..." : "Find my resources"}
          </button>
        </form>

        {successMessage && (
          <div className="mt-6 rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-emerald-300">
            {successMessage}{" "}
            <a href="/bookings" className="underline">
              View My Bookings
            </a>
          </div>
        )}

        {searchError && (
          <div role="status" className="mt-6 rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-amber-200">
            {searchError}
          </div>
        )}

        {hasSearched && profileMessage && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="font-medium text-cyan-300">Capability filter applied</p>
            <p className="mt-1 text-sm text-slate-300">{profileMessage}</p>
            {excludedResources.length > 0 && (
              <p className="mt-2 text-sm text-slate-400">
                Excluded for insufficient or unknown VRAM: {excludedResources.join(", ")}
              </p>
            )}
          </div>
        )}

        {recommendations.length > 0 && (
          <section className="mt-10">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
                  ChromaDB + capability filtering
                </p>
                <h2 className="mt-2 text-2xl font-bold">
                  Recommended for your task
                </h2>
              </div>
              <span className="text-sm text-slate-400">
                {recommendations.length} matches
              </span>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {recommendations.map((resource, index) => (
                <article
                  key={resource.resource_id}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-cyan-300">
                      {resource.category}
                    </span>
                    <span className="text-sm text-slate-500">
                      Match #{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold">{resource.name}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {resource.description}
                  </p>

                  {resource.capabilities && (
                    <p className="mt-4 text-sm text-slate-300">
                      <span className="font-medium text-cyan-300">Capabilities: </span>
                      {resource.capabilities}
                    </p>
                  )}

                  {resource.specifications &&
                    Object.keys(resource.specifications).length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {Object.entries(resource.specifications)
                          .filter(([key]) => key !== "workloads")
                          .map(([key, value]) => (
                            <span
                              key={key}
                              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300"
                            >
                              {key.replaceAll("_", " ")}: {String(value)}
                            </span>
                          ))}
                      </div>
                    )}

                  <p className="mt-4 text-xs leading-5 text-slate-500">
                    {resource.recommendation_reason ||
                      "Ranked by semantic relevance and filtered by the detected capability profile."}
                  </p>

                  <button
                    type="button"
                    onClick={() => openBooking(resource)}
                    className="mt-5 w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-300"
                  >
                    Select and book
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="mt-14">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Browse all resources</h2>
              <p className="mt-1 text-sm text-slate-400">
                Browse the inventory directly if you already know what you need.
              </p>
            </div>
            <span className="text-sm text-slate-400">
              {filteredResources.length} resources
            </span>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`rounded-full border px-4 py-2 text-sm ${
                  category === item
                    ? "border-cyan-400 bg-cyan-400 text-slate-950"
                    : "border-slate-700 text-slate-300 hover:border-slate-500"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="py-8 text-slate-400">Loading resources...</p>
          ) : pageError ? (
            <p className="rounded-xl border border-red-900 p-4 text-red-300">
              {pageError}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredResources.map((resource) => (
                <article
                  key={resource.resource_id}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-5"
                >
                  <p className="text-xs text-cyan-300">{resource.category}</p>
                  <h3 className="mt-2 font-semibold">{resource.name}</h3>
                  <p className="mt-2 text-sm text-slate-400">
                    {resource.description}
                  </p>
                  <button
                    type="button"
                    onClick={() => openBooking(resource)}
                    className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm hover:border-cyan-400"
                  >
                    Book this resource
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {bookingResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-booking-title"
            className="my-auto w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-cyan-300">Confirm reservation</p>
                <h2 id="confirm-booking-title" className="mt-1 text-xl font-bold">
                  {bookingResource.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setBookingResource(null)}
                aria-label="Close"
                className="text-xl text-slate-400 hover:text-white"
              >
                ×
              </button>
            </div>

            <p className="mt-4 text-sm text-slate-400">
              {startDate} · {timeLabel(startTime)} – {endDate} · {timeLabel(endTime)}
            </p>

            <form onSubmit={confirmBooking} className="mt-5 space-y-4">

              {bookingError && (
                <p role="alert" className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
                  {bookingError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setBookingResource(null)}
                  disabled={bookingLoading}
                  className="flex-1 rounded-lg border border-slate-700 px-4 py-3 hover:bg-slate-800"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={bookingLoading || !validRange}
                  className="flex-1 rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
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
