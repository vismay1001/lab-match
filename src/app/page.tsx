
"use client";

import { useEffect, useState } from "react";

type Resource = {
  resource_id: number;
  name: string;
  category: string;
  description: string;
  is_active: boolean;
  created_at: string;
};

export default function Home() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

        <div className="mb-5 mt-8 flex items-center justify-between">
          <h3 className="text-xl font-semibold">Available resources</h3>
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
                    onClick={() =>
                      alert(
                        `Booking flow for ${resource.name} will be added next.`
                      )
                    }
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
    </main>
  );
}
