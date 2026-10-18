import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, bookings } from "@/lib/db";
import { authed, canAccess } from "@/lib/auth";
import { handleBookingCanceled } from "@/lib/automation";

export const PATCH = authed(async (req, { params }, user) => {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, params.id)).limit(1);
  if (!booking || !canAccess(user, booking.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { status } = await req.json().catch(() => ({}));
  if (status !== "canceled") return NextResponse.json({ error: "Only cancelling is supported here." }, { status: 400 });
  await handleBookingCanceled(booking.provider, booking.externalId);
  return NextResponse.json({ ok: true });
});
