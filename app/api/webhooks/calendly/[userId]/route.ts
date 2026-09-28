import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { hmacHex, safeEqual } from "@/lib/crypto";
import { handleBookingCanceled, handleBookingCreated } from "@/lib/automation";

const TOLERANCE_SEC = 10 * 60;

type CalendlyEvent = {
  event?: string;
  payload?: {
    uri?: string;
    email?: string;
    name?: string;
    timezone?: string;
    scheduled_event?: { start_time?: string; end_time?: string };
    tracking?: { utm_content?: string | null; utm_campaign?: string | null };
  };
};

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.userId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [owner] = await db.select().from(users).where(eq(users.id, params.userId)).limit(1);
  if (!owner?.calendlySigningKey) return NextResponse.json({ error: "Not configured" }, { status: 404 });

  const raw = await req.text();
  const header = req.headers.get("calendly-webhook-signature") ?? "";
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > TOLERANCE_SEC || !safeEqual(parts.v1 ?? "", hmacHex(owner.calendlySigningKey, `${t}.${raw}`))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  const event = JSON.parse(raw) as CalendlyEvent;
  const p = event.payload ?? {};
  if (!p.uri) return NextResponse.json({ ok: true });

  if (event.event === "invitee.canceled") {
    await handleBookingCanceled("calendly", p.uri);
  } else if (event.event === "invitee.created" && p.scheduled_event?.start_time && p.scheduled_event.end_time) {
    await handleBookingCreated({
      ownerId: owner.id,
      provider: "calendly",
      externalId: p.uri,
      startAt: new Date(p.scheduled_event.start_time),
      endAt: new Date(p.scheduled_event.end_time),
      timezone: p.timezone ?? null,
      email: p.email ?? null,
      name: p.name ?? null,
      contactIdHint: p.tracking?.utm_content ?? null,
      campaignIdHint: p.tracking?.utm_campaign ?? null,
    });
  }
  return NextResponse.json({ ok: true });
}
