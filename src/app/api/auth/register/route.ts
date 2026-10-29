
import { NextResponse } from "next/server";
import { randomBytes, scryptSync } from "node:crypto";
import { pool } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const name =
      typeof body.name === "string" ? body.name.trim() : "";

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string" ? body.password : "";

    if (name.length < 2 || name.length > 100) {
      return NextResponse.json(
        { error: "Name must be between 2 and 100 characters." },
        { status: 400 }
      );
    }

    // Correct email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must contain at least 6 characters." },
        { status: 400 }
      );
    }

    const salt = randomBytes(16).toString("hex");
    const hash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING user_id, name, email, role`,
      [name, email, hash]
    );

    return NextResponse.json(
      { success: true, user: result.rows[0] },
      { status: 201 }
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        {
          error:
            "An account with this email already exists. Please log in.",
        },
        { status: 409 }
      );
    }

    console.error("Registration failed:", error);

    return NextResponse.json(
      {
        error: "Unable to create account. Check database setup.",
      },
      { status: 500 }
    );
  }
}
