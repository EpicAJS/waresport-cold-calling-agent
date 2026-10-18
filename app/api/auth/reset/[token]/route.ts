import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, passwordResets, sessions, users } from "@/lib/db";
import { createSession, hashPassword, validatePassword } from "@/lib/auth";
import { findValidReset } from "@/lib/password-reset";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const reset = await findValidReset(params.token);
  if (!reset) return NextResponse.json({ error: "This reset link is invalid, already used, or expired." }, { status: 404 });

  const { password } = await req.json().catch(() => ({}));
  const err = validatePassword(password);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, reset.userId));
  // Use up every outstanding link for this user and sign out all existing sessions.
  await db.update(passwordResets).set({ usedAt: new Date() })
    .where(and(eq(passwordResets.userId, reset.userId), isNull(passwordResets.usedAt)));
  await db.delete(sessions).where(eq(sessions.userId, reset.userId));

  await createSession(reset.userId);
  return NextResponse.json({ ok: true });
}
