import { and, eq, lte } from "drizzle-orm";
import { db, bookings, inboundMessages } from "@/lib/db";
import { advanceDeal } from "@/lib/automation";

/** Snoozed replies come back to the AI Inbox once their snooze date passes. */
export async function wakeSnoozed() {
  const woke = await db.update(inboundMessages)
    .set({ status: "new", snoozedUntil: null })
    .where(and(eq(inboundMessages.status, "snoozed"), lte(inboundMessages.snoozedUntil, new Date())))
    .returning({ id: inboundMessages.id });
  return woke.length;
}

/** Demos whose time has passed (and weren't canceled) move their deal to "demo held". */
export async function markDemosHeld() {
  const past = await db.select({ contactId: bookings.contactId, ownerId: bookings.ownerId, campaignId: bookings.campaignId })
    .from(bookings)
    .where(and(eq(bookings.status, "scheduled"), lte(bookings.endAt, new Date())));
  for (const b of past) {
    if (b.contactId) await advanceDeal({ contactId: b.contactId, ownerId: b.ownerId, campaignId: b.campaignId, stage: "demo-held", source: "booking" });
  }
  return past.length;
}
