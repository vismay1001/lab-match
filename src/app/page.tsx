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
  recommendation_reason?: string;
};

type Recommendation = Resource & {
  similarity_distance?: number;
  recommendation_reason?: string;
  estimated_gpu_tier?: number;
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
  // Use a fixed date so formatting does not depend on the current render time.
  const date = new Date(2000, 0, 1, hours, minutes, 0, 0);
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
  const [today, setToday] = useState("");
  const [persistedStartDate, setPersistedStartDate] = useState("");
  const [persistedStartTime, setPersistedStartTime] = useState("10:00");
  const [persistedEndDate, setPersistedEndDate] = useState("");
  const [persistedEndTime, setPersistedEndTime] = useState("11:00");

  const [resources, setResources] = useState<Resource[]>([]);
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [task, setTask] = useState("");
  const [userId, setUserId] = useState("");
  const [loggedInName, setLoggedInName] = useState("");

  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("11:00");

  useEffect(() => {
    const currentToday = dateString(new Date());
    setToday(currentToday);

    const raw = localStorage.getItem("labmatch_user");
    if (raw) {
      try {
        const user = JSON.parse(raw) as { user_id?: number; name?: string };
        if (user.user_id) setUserId(String(user.user_id));
        if (user.name) setLoggedInName(user.name);
      } catch {
        localStorage.removeItem("labmatch_user");
      }
    }

    const savedStart = localStorage.getItem("labmatch_start_date");
    const savedStartTime = localStorage.getItem("labmatch_start_time");
    const savedEnd = localStorage.getItem("labmatch_end_date");
    const savedEndTime = localStorage.getItem("labmatch_end_time");

    if (savedStart && savedEnd) {
      setPersistedStartDate(savedStart);
      setPersistedStartTime(savedStartTime || "10:00");
      setPersistedEndDate(savedEnd);
      setPersistedEndTime(savedEndTime || "11:00");
    }

    setStartDate(savedStart || currentToday);
    if (savedStartTime) setStartTime(savedStartTime);
    setEndDate(savedEnd || currentToday);
    if (savedEndTime) setEndTime(savedEndTime);
  }, []);

  useEffect(() => {
    if (!startDate) return;
    try {
      localStorage.setItem("labmatch_start_date", startDate);
      localStorage.setItem("labmatch_start_time", startTime);
      localStorage.setItem("labmatch_end_date", endDate);
      localStorage.setItem("labmatch_end_time", endTime);
    } catch {
      // Ignore quota errors
    }
  }, [startDate, startTime, endDate, endTime]);

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [profileMessage, setProfileMessage] = useState("");
  const [excludedResources, setExcludedResources] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const [bookingResource, setBookingResource] = useState<Recommendation | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const start = startDate && startTime ? new Date(`${startDate}T${startTime}:00`) : null;
  const end = endDate && endTime ? new Date(`${endDate}T${endTime}:00`) : null;
  const validRange = Boolean(
    start &&
    end &&
    Number.isFinite(start.getTime()) &&
    Number.isFinite(end.getTime()) &&
    end.getTime() > start.getTime()
  );

// Load resources on mount
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

function openBooking(resource: Recommendation) {
  setBookingResource(resource);
  setBookingError("");
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

  if (!validRange || !start || !end) {
    setSearchError("End time must be later than start time.");
    return;
  }

  setSearching(true);
  setSearchError("");
  setProfileMessage("");
  setExcludedResources([]);
  setRecommendations([]);
  setHasSearched(false);

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

async function confirmBooking(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!bookingResource) return;

  if (!userId) {
    // Store current selections and redirect to login
    try {
      localStorage.setItem(
        "labmatch_booking_resource",
        JSON.stringify(bookingResource)
      );
      localStorage.setItem("labmatch_start_date", startDate);
      localStorage.setItem("labmatch_start_time", startTime);
      localStorage.setItem("labmatch_end_date", endDate);
      localStorage.setItem("labmatch_end_time", endTime);
    } catch {
      // Ignore
    }
    window.location.href = "/login";
    return;
  }

  if (!validRange || !start || !end) {
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
      // Provide meaningful feedback based on the error code.
      const errorMessage =
        data.error ||
        (data.code === "USER_BOOKING_CONFLICT"
          ? "You already have another booking during this time slot."
          : data.code === "RESOURCE_ALREADY_ASSIGNED"
              ? "This resource is already assigned to another person. Please choose a different resource or wait for the current assignment to be released."
              : data.code === "RESOURCE_BOOKING_CONFLICT"
                  ? "This resource is already booked for that time slot."
                  : "Unable to create booking. Check the details and try again.");
      throw new Error(errorMessage);
    }

    setSuccessMessage(
      `Booking confirmed! Booking ID: ${data.booking?.booking_id ?? "Created"}`
    );
    setBookingResource(null);

    // Clear persisted selections since the booking is complete.
    try {
      localStorage.removeItem("labmatch_booking_resource");
      localStorage.removeItem("labmatch_start_date");
      localStorage.removeItem("labmatch_start_time");
      localStorage.removeItem("labmatch_end_date");
      localStorage.removeItem("labmatch_end_time");
    } catch {
      // Ignore.
    }

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

// Persist booking resource and datetime selections across refreshes.
useEffect(() => {
  const persistedBookingResource = localStorage.getItem(
    "labmatch_booking_resource"
  );
  if (persistedBookingResource) {
    try {
      const resource = JSON.parse(persistedBookingResource) as Recommendation;
      setBookingResource(resource);
      // Clear the persisted resource now that it's been restored.
      localStorage.removeItem("labmatch_booking_resource");
      localStorage.removeItem("labmatch_start_date");
      localStorage.removeItem("labmatch_start_time");
      localStorage.removeItem("labmatch_end_date");
      localStorage.removeItem("labmatch_end_time");
    } catch {
      localStorage.removeItem("labmatch_booking_resource");
    }
  }
}, []);

// Sync datetime persistence on navigation away
useEffect(() => {
  // Store selections when user navigates away or closes the tab
  return () => {
    try {
      if (bookingResource) {
        localStorage.setItem(
          "labmatch_booking_resource",
          JSON.stringify(bookingResource)
        );
      } else {
        localStorage.removeItem("labmatch_booking_resource");
      }
      localStorage.setItem("labmatch_start_date", startDate);
      localStorage.setItem("labmatch_start_time", startTime);
      localStorage.setItem("labmatch_end_date", endDate);
      localStorage.setItem("labmatch_end_time", endTime);
    } catch {
      // Ignore.
    }
  };
}, [bookingResource, startDate, startTime, endDate, endTime]);

return (
  <main className="min-h-screen bg-[#0a0e17] text-slate-100">
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white md:hidden">
            Lab<span className="text-primary">Match</span>
          </a>
          <div className="hidden md:block">
            <h1 className="text-xl font-semibold text-white">Resource Booking</h1>
            <p className="text-xs text-slate-400">Match research & compute tasks to university hardware</p>
          </div>
          {loggedInName ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">Hi, <strong className="text-white">{loggedInName}</strong></span>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem("labmatch_user");
                  window.location.href = "/login";
                }}
                className="rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm text-slate-300 hover:border-primary hover:text-white transition"
              >
                Log out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <a
                href="/login"
                className="rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm text-slate-300 hover:border-primary hover:text-white transition"
              >
                Log in
              </a>
              <a
                href="/register"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition"
              >
                Register
              </a>
            </div>
          )}
        </div>
      </header>

      {/* Hero / Search Section */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 shadow-sm">
        <p className="mb-4 text-sm font-medium uppercase tracking-wider text-slate-400">
          Intelligent campus resource booking
        </p>

        <h1 className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight text-white">
          What are you
          <br />
          <span className="text-slate-400">planning to do?</span>
        </h1>

        <p className="mt-4 max-w-2xl text-slate-300">
          Describe your project. LabMatch matches your task against resource
          capabilities, filters unsuitable hardware, and checks availability.
        </p>

        {/* Persistence hint */}
        {persistedStartDate && persistedEndDate && !hasSearched && (
          <div className="mt-4 p-3 rounded-xl bg-slate-800/80 border border-slate-700">
            <p className="text-xs text-slate-400">
              Previous selections detected — restoring your session.
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {persistedStartDate} · {timeLabel(persistedStartTime)} –
              {persistedEndDate} · {timeLabel(persistedEndTime)}
            </p>
          </div>
        )}

        <form
          onSubmit={recommendResources}
          className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-inner"
        >
          <label htmlFor="task" className="block mb-2 font-medium text-white">
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
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none placeholder:text-slate-400 focus:border-primary resize-none"
          />

          <p className="mt-3 text-xs text-slate-400">
            Examples: introductory ML, CNN training, LLM fine-tuning, 3D rendering.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 mt-6">
            <div>
              <label htmlFor="startDate" className="mb-2 block text-sm font-medium text-slate-300">
                Start date
              </label>
              <input
                id="startDate"
                type="date"
                min={today}
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="startTime" className="mb-2 block text-sm font-medium text-slate-300">
                Start time
              </label>
              <select
                id="startTime"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-primary"
              >
                {TIMES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="endDate" className="mb-2 block text-sm font-medium text-slate-300">
                End date
              </label>
              <input
                id="endDate"
                type="date"
                min={startDate || today}
                required
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="endTime" className="mb-2 block text-sm font-medium text-slate-300">
                End time
              </label>
              <select
                id="endTime"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-white outline-none focus:border-primary"
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
                className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-300 hover:border-primary hover:text-white transition"
              >
                {duration.label}
              </button>
            ))}
          </div>

          {!validRange && (
            <p className="mt-3 text-sm text-error">
              End time must be later than start time.
            </p>
          )}

          <button
            type="submit"
            disabled={searching || !validRange}
            className="mt-6 w-full rounded-xl bg-primary px-5 py-3 font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50 sm:w-auto"
          >
            {searching ? "Finding suitable resources..." : "Find my resources"}
          </button>
        </form>

        {successMessage && (
          <div className="mt-6 rounded-xl bg-success/15 border border-success p-4">
            {successMessage}
            <a href="/bookings" className="underline text-primary ml-2">
              View My Bookings
            </a>
          </div>
        )}

        {searchError && (
          <div className="mt-6 rounded-xl bg-error/10 border border-error p-4">
            {searchError}
          </div>
        )}

        {hasSearched && profileMessage && (
          <div className="mt-6 rounded-xl bg-slate-800 p-4">
            <p className="font-medium text-primary">Capability filter applied</p>
            <p className="mt-1 text-sm text-slate-300">{profileMessage}</p>
            {excludedResources.length > 0 && (
              <p className="mt-2 text-sm text-slate-400">
                Excluded for insufficient or unknown VRAM:{" "}{" "}
                {excludedResources.join(", ")}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Recommendations Section */}
      {recommendations.length > 0 && (
        <section className="mt-8">
          <div className="mb-6">
            <p className="text-sm font-medium uppercase tracking-wider text-slate-500">
              ChromaDB + capability filtering
            </p>
            <h2 className="mt-2 text-2xl font-bold">
              Recommended for your task
            </h2>
            <span className="text-sm text-slate-400">
              {recommendations.length} matches
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.map((resource, index) => (
              <article
                key={resource.resource_id}
                className="rounded-2xl bg-slate-800 p-6 hover:bg-slate-700 transition-colors border border-slate-500/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-slate-600 px-3 py-1 text-xs text-slate-400">
                    {resource.category}
                  </span>
                  <span className="text-sm text-slate-500">
                    Match #{index + 1}
                  </span>
                </div>

                <h3 className="mt-4 text-xl font-semibold">{resource.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  {resource.description}
                </p>

                {resource.capabilities && (
                  <p className="mt-4 text-sm text-slate-300">
                    <span className="font-medium text-primary">Capabilities: </span>
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
                            className="rounded-md border border-slate-500 px-2 py-1 text-xs text-slate-400"
                          >
                            {key.replaceAll("_", " ")}: {String(value)}
                          </span>
                        ))}
                    </div>
                  )}

                <p className="mt-4 text-xs leading-relaxed text-slate-400">
                  {resource.recommendation_reason ||
                    "Ranked by semantic relevance and filtered by the detected capability profile."}
                </p>

                <button
                  type="button"
                  onClick={() => openBooking(resource)}
                  className="mt-5 w-full rounded-xl bg-primary px-5 py-3 font-semibold text-slate-950 hover:bg-primary/90 transition"
                >
                  Select and book
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Browse All Resources Section */}
      <section className="mt-14">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-white">Browse all resources</h2>
          <p className="mt-1 text-sm text-slate-400">
            Browse the inventory directly if you already know what you need.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                category === item
                  ? "border-primary bg-primary text-white font-medium"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500 hover:text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredResources.map((resource) => (
            <article
              key={resource.resource_id}
              className="rounded-xl bg-slate-800 p-5 border border-slate-700 hover:bg-slate-700 transition-colors"
            >
              <p className="text-xs text-primary font-medium">{resource.category}</p>
              <h3 className="mt-2 font-semibold text-white">{resource.name}</h3>
              <p className="mt-2 text-sm text-slate-300">
                {resource.description}
              </p>

              {resource.capabilities && (
                <p className="mt-3 text-sm text-slate-300">
                  <span className="font-medium text-primary">Capabilities: </span>
                  {resource.capabilities}
                </p>
              )}

              {resource.specifications &&
                Object.keys(resource.specifications).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(resource.specifications)
                      .filter(([key]) => key !== "workloads")
                      .map(([key, value]) => (
                        <span
                          key={key}
                          className="rounded-md border border-slate-500 px-2 py-1 text-xs text-slate-400"
                        >
                          {key.replaceAll("_", " ")}: {String(value)}
                        </span>
                      ))}
                  </div>
                )}

                <p className="mt-3 text-xs leading-relaxed text-slate-400">
                  {resource.recommendation_reason ||
                    "Ranked by semantic relevance and filtered by the detected capability profile."}
                </p>

                <button
                  type="button"
                  onClick={() => openBooking(resource)}
                  className="mt-3 rounded-lg border border-slate-400 px-4 py-2 text-sm text-primary hover:border-primary transition"
                >
                  Book this resource
                </button>
              </article>
            ))}
        </div>
      </section>
    </div>

    {/* Booking Dialog */}
  {bookingResource && (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-booking-title"
        className="my-auto w-full max-w-md rounded-xl bg-slate-800 border border-slate-500 p-6 shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400">Confirm reservation</p>
            <h2 id="confirm-booking-title" className="mt-1 text-xl font-bold">
              {bookingResource.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setBookingResource(null)}
            aria-label="Close"
            className="text-sm text-slate-500 hover:text-primary transition"
          >
            ×
          </button>
        </div>

        <p className="mt-4 text-sm text-slate-400">
          {startDate} · {timeLabel(startTime)} – {endDate} · {timeLabel(endTime)}
        </p>

        <form onSubmit={confirmBooking} className="mt-6 space-y-4">

          {bookingError && (
            <p
              role="alert"
              className="rounded-lg border border-error bg-error/10 p-3 text-sm text-error"
            >
              {bookingError}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setBookingResource(null)}
              disabled={bookingLoading}
              className="flex-1 rounded-lg border border-slate-400 px-4 py-3 hover:bg-slate-700 transition"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={bookingLoading || !validRange}
              className="flex-1 rounded-xl bg-primary px-4 py-3 font-semibold text-slate-950 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
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
