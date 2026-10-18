import { NextResponse } from "next/server";
import { and, asc, desc, eq, isNotNull, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, bookings, campaigns, contacts, users } from "@/lib/db";
import { authed, canAccess, ownedBy } from "@/lib/auth";
import { handleBookingCreated } from "@/lib/automation";
import { isValidTimeZone } from "@/lib/time";

export const GET = authed(async (_req, _ctx, user) => {
  const demos = await db
    .select({
      id: bookings.id,
      provider: bookings.provider,
      status: bookings.status,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      timezone: bookings.timezone,
      inviteeEmail: bookings.inviteeEmail,
      inviteeName: bookings.inviteeName,
      contactId: bookings.contactId,
      clubName: contacts.clubName,
      phone: contacts.phone,
      campaignName: campaigns.name,
      ownerName: users.name,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.ownerId, users.id))
    .leftJoin(contacts, eq(bookings.contactId, contacts.id))
    .leftJoin(campaigns, eq(bookings.campaignId, campaigns.id))
    .where(ownedBy(user, bookings.ownerId))
    .orderBy(desc(bookings.startAt))
    .limit(500);

  const followUps = await db
    .select({
      id: contacts.id,
      clubName: contacts.clubName,
      contactName: contacts.contactName,
      phone: contacts.phone,
      altPhone: contacts.altPhone,
      email: contacts.email,
      stage: contacts.stage,
      needsFollowUp: contacts.needsFollowUp,
      updatedAt: contacts.updatedAt,
      ownerName: users.name,
    })
    .from(contacts)
    .innerJoin(users, eq(contacts.ownerId, users.id))
    .where(and(ownedBy(user, contacts.ownerId), or(isNotNull(contacts.needsFollowUp), eq(contacts.stage, "demo-requested"))))
    .orderBy(asc(contacts.updatedAt))
    .limit(500);

  return NextResponse.json({ demos, followUps });
});

// Log a demo booked outside Cal.com/Calendly so reminders and follow-ups still go out.
export const POST = authed(async (req, _ctx, user) => {
  const { contactId, startAt, durationMin, timezone } = await req.json().catch(() => ({}));
  const [contact] = typeof contactId === "string"
    ? await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1)
    : [];
  if (!contact || !canAccess(user, contact.ownerId)) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  const start = new Date(startAt);
  if (isNaN(start.getTime())) return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
  const minutes = Number(durationMin) > 0 ? Number(durationMin) : 30;

  const booking = await handleBookingCreated({
    ownerId: contact.ownerId,
    provider: "manual",
    externalId: randomUUID(),
    startAt: start,
    endAt: new Date(start.getTime() + minutes * 60_000),
    timezone: isValidTimeZone(timezone) ? timezone : null,
    email: contact.email,
    name: contact.contactName,
    contactIdHint: contact.id,
  });
  return NextResponse.json(booking, { status: 201 });
});
