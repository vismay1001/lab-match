"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Registration failed.");
      localStorage.setItem("labmatch_user", JSON.stringify(data.user));
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0e17] text-slate-100 flex items-center justify-center p-4">
      <section
        className="rounded-2xl bg-slate-800 border border-slate-500 w-full max-w-md p-8 shadow-lg"
      >
        <a
          href="/"
          className="flex items-center gap-2 text-2xl font-bold text-primary mb-6"
        >
          Lab<span className="text-primary">Match</span>
        </a>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1.5">
              Full name
            </label>
            <input
              id="name"
              required
              maxLength={100}
              value={name}
              onChange={e => setName(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              minLength={6}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input w-full"
            />
            <p className="text-xs text-slate-400">At least 6 characters.</p>
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium mb-1.5">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="input w-full"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="alert alert-error rounded-lg border border-error/30 p-3 text-sm text-error"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-400">
          Already registered? <a className="text-primary hover:underline" href="/login">
            Log in
          </a>
        </p>
      </section>
    </main>
  );
}