import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ success: true, message: "Demo logout is handled by clearing browser localStorage." });
}
