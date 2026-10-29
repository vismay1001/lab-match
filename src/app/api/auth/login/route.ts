import { NextResponse } from "next/server";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { pool } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
    const result = await pool.query("SELECT user_id, name, email, role, password_hash FROM users WHERE email = $1", [email]);
    if (!result.rowCount) return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    const user = result.rows[0];
    const [salt, saved] = String(user.password_hash || "").split(":");
    if (!salt || !saved) return NextResponse.json({ error: "This account has no password set. Register a new demo account." }, { status: 401 });
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(saved, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    const { password_hash: _passwordHash, ...safeUser } = user;
    return NextResponse.json({ success: true, user: safeUser });
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json({ error: "Unable to log in. Check database setup." }, { status: 500 });
  }
}
