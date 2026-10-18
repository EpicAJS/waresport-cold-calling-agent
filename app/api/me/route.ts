import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users, type BookingProvider } from "@/lib/db";
import { authed, hashPassword, validatePassword, verifyPassword } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { appUrl } from "@/lib/env";

const PROVIDERS: BookingProvider[] = ["link", "calcom", "calendly"];

export const GET = authed(async (_req, _ctx, user) => {
  const [u] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  return NextResponse.json({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    bookingProvider: u.bookingProvider,
    bookingUrl: u.bookingUrl ?? "",
    calendlyConnected: Boolean(u.calendlyWebhookUri),
    calcomWebhookUrl: `${appUrl()}/api/webhooks/calcom/${u.id}`,
    calcomSecret: u.calcomWebhookSecret ?? "",
  });
});

export const PATCH = authed(async (req, _ctx, user) => {
  const body = await req.json().catch(() => ({}));
  const [u] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const patch: Partial<typeof users.$inferInsert> = {};

  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();

  if (body.newPassword !== undefined) {
    if (!(await verifyPassword(String(body.currentPassword ?? ""), u.passwordHash))) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
    const err = validatePassword(body.newPassword);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    patch.passwordHash = await hashPassword(body.newPassword);
  }

  if (body.bookingProvider !== undefined) {
    if (!PROVIDERS.includes(body.bookingProvider)) return NextResponse.json({ error: "Invalid booking provider." }, { status: 400 });
    patch.bookingProvider = body.bookingProvider;
    if (body.bookingProvider === "calcom" && !u.calcomWebhookSecret) patch.calcomWebhookSecret = randomToken(24);
  }
  if (typeof body.bookingUrl === "string") {
    const url = body.bookingUrl.trim();
    if (url && !/^https:\/\/\S+$/.test(url)) return NextResponse.json({ error: "Booking link must start with https://" }, { status: 400 });
    patch.bookingUrl = url || null;
  }
  if (body.regenerateCalcomSecret) patch.calcomWebhookSecret = randomToken(24);

  if (Object.keys(patch).length) await db.update(users).set(patch).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
});
