import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { createSession, hashPassword, validatePassword } from "@/lib/auth";

// Creates the first (admin) account. Disabled once any user exists.
export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json().catch(() => ({}));
  if (typeof name !== "string" || !name.trim() || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });
  }
  const pwError = validatePassword(password);
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

  const passwordHash = await hashPassword(password);
  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242)`);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(users);
    if (count > 0) return null;
    const [u] = await tx
      .insert(users)
      .values({ name: name.trim(), email: email.trim().toLowerCase(), passwordHash, role: "admin" })
      .returning({ id: users.id });
    return u;
  });

  if (!created) return NextResponse.json({ error: "Setup is already complete. Please sign in." }, { status: 409 });
  await createSession(created.id);
  return NextResponse.json({ ok: true });
}
