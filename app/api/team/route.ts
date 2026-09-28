import { NextResponse } from "next/server";
import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { db, invites, users, type Role } from "@/lib/db";
import { authed } from "@/lib/auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { sendSimpleEmail } from "@/lib/email";
import { getOrgSettings } from "@/lib/settings";

const INVITE_DAYS = 7;

export const GET = authed(async () => {
  const members = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, disabled: users.disabled, createdAt: users.createdAt })
    .from(users)
    .orderBy(asc(users.createdAt));
  const pending = await db
    .select({ id: invites.id, email: invites.email, role: invites.role, expiresAt: invites.expiresAt, createdAt: invites.createdAt })
    .from(invites)
    .where(and(isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .orderBy(desc(invites.createdAt));
  return NextResponse.json({ members, invites: pending });
}, { admin: true });

export const POST = authed(async (req, _ctx, user) => {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role: Role = body.role === "admin" ? "admin" : "rep";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return NextResponse.json({ error: "That person already has an account." }, { status: 409 });

  const token = randomToken();
  await db.insert(invites).values({
    tokenHash: sha256(token),
    email,
    role,
    invitedBy: user.id,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 3600e3),
  });
  const link = `${appUrl()}/invite/${token}`;

  const org = await getOrgSettings();
  const sent = await sendSimpleEmail(
    email,
    `${user.name} invited you to ${org.companyName}'s calling workspace`,
    `${user.name} invited you to join ${org.companyName}'s AI cold calling workspace.\n\nCreate your account here (link expires in ${INVITE_DAYS} days):\n${link}`,
    org
  );
  return NextResponse.json({ ok: true, link, emailed: sent.ok });
}, { admin: true });
