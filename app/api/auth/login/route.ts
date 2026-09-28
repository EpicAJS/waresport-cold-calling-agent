import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  const ok = user && !user.disabled && (await verifyPassword(password, user.passwordHash));
  if (!ok) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
