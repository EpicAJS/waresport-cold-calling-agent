import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { hmacHex, safeEqual } from "@/lib/crypto";
import { handleBookingCanceled, handleBookingCreated } from "@/lib/automation";

type CalPayload = {
  triggerEvent?: string;
  payload?: {
    uid?: string;
    startTime?: string;
    endTime?: string;
    rescheduleUid?: string;
    fromReschedule?: string;
    attendees?: Array<{ email?: string; name?: string; timeZone?: string }>;
    metadata?: Record<string, string>;
  };
};

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.userId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [owner] = await db.select().from(users).where(eq(users.id, params.userId)).limit(1);
  if (!owner?.calcomWebhookSecret) return NextResponse.json({ error: "Not configured" }, { status: 404 });

  const raw = await req.text();
  const signature = req.headers.get("x-cal-signature-256") ?? "";
  if (!safeEqual(signature, hmacHex(owner.calcomWebhookSecret, raw))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  const event = JSON.parse(raw) as CalPayload;
  const p = event.payload ?? {};
  const trigger = event.triggerEvent ?? "";

  if (trigger === "BOOKING_CANCELLED" && p.uid) {
    await handleBookingCanceled("calcom", p.uid);
  } else if ((trigger === "BOOKING_CREATED" || trigger === "BOOKING_RESCHEDULED") && p.uid && p.startTime && p.endTime) {
    const previous = p.rescheduleUid || p.fromReschedule;
    if (trigger === "BOOKING_RESCHEDULED" && previous && previous !== p.uid) await handleBookingCanceled("calcom", previous);
    const attendee = p.attendees?.[0] ?? {};
    await handleBookingCreated({
      ownerId: owner.id,
      provider: "calcom",
      externalId: p.uid,
      startAt: new Date(p.startTime),
      endAt: new Date(p.endTime),
      timezone: attendee.timeZone ?? null,
      email: attendee.email ?? null,
      name: attendee.name ?? null,
      contactIdHint: p.metadata?.contactId ?? null,
      campaignIdHint: p.metadata?.campaignId ?? null,
    });
  }
  return NextResponse.json({ ok: true });
}
