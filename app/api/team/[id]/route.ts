import { NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, sessions, users } from "@/lib/db";
import { authed } from "@/lib/auth";

export const PATCH = authed(async (req, { params }, user) => {
  const body = await req.json().catch(() => ({}));
  const patch: Partial<typeof users.$inferInsert> = {};
  if (body.role === "admin" || body.role === "rep" || body.role === "intern") patch.role = body.role;
  if (typeof body.disabled === "boolean") patch.disabled = body.disabled;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const demoting = (patch.role !== undefined && patch.role !== "admin") || patch.disabled === true;
  if (demoting) {
    const [{ admins }] = await db.select({ admins: sql<number>`count(*)::int` }).from(users)
      .where(and(eq(users.role, "admin"), eq(users.disabled, false), ne(users.id, params.id)));
    if (admins === 0) return NextResponse.json({ error: "There must be at least one active admin." }, { status: 400 });
  }
  if (params.id === user.id && patch.disabled) return NextResponse.json({ error: "You can't disable yourself." }, { status: 400 });

  await db.update(users).set(patch).where(eq(users.id, params.id));
  if (patch.disabled) await db.delete(sessions).where(eq(sessions.userId, params.id));
  return NextResponse.json({ ok: true });
}, { admin: true });
