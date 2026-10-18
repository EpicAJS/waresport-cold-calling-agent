import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, invites, users } from "@/lib/db";
import { createSession, hashPassword, validatePassword } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";

async function findInvite(token: string) {
  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.tokenHash, sha256(token)), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .limit(1);
  return invite ?? null;
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const invite = await findInvite(params.token);
  if (!invite) return NextResponse.json({ error: "This invite link is invalid or has expired." }, { status: 404 });

  const { name, password } = await req.json().catch(() => ({}));
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  const pwError = validatePassword(password);
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

  const email = invite.email.toLowerCase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });

  const [user] = await db
    .insert(users)
    .values({ name: name.trim(), email, passwordHash: await hashPassword(password), role: invite.role })
    .returning({ id: users.id });
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
