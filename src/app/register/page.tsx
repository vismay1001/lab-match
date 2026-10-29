"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [name,setName] = useState(""); const [email,setEmail] = useState("");
  const [password,setPassword] = useState(""); const [confirm,setConfirm] = useState("");
  const [error,setError] = useState(""); const [loading,setLoading] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email,password})});
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Registration failed.");
      localStorage.setItem("labmatch_user",JSON.stringify(data.user)); router.push("/");
    } catch (err) { setError(err instanceof Error ? err.message : "Registration failed."); }
    finally { setLoading(false); }
  }
  return <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900"><section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
    <a href="/" className="text-2xl font-bold">Lab<span className="text-teal-600">Match</span></a><p className="mt-8 text-sm font-semibold uppercase tracking-wider text-teal-700">Create account</p><h1 className="mt-2 text-3xl font-semibold">Join LabMatch</h1><p className="mt-2 text-sm text-slate-600">Create an account to reserve campus resources.</p>
    <form onSubmit={submit} className="mt-7 space-y-4">
      <div><label htmlFor="name" className="mb-1.5 block text-sm font-medium">Full name</label><input id="name" required maxLength={100} value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5"/></div>
      <div><label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</label><input id="email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5"/></div>
      <div><label htmlFor="password" className="mb-1.5 block text-sm font-medium">Password</label><input id="password" type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5"/><p className="mt-1 text-xs text-slate-500">At least 6 characters.</p></div>
      <div><label htmlFor="confirm" className="mb-1.5 block text-sm font-medium">Confirm password</label><input id="confirm" type="password" required value={confirm} onChange={e=>setConfirm(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5"/></div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={loading} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">{loading?"Creating account...":"Create account"}</button>
    </form><p className="mt-5 text-center text-sm text-slate-600">Already registered? <a className="font-semibold text-teal-700" href="/login">Log in</a></p>
  </section></main>;
}
