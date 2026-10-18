import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, calls, campaigns, contacts, users } from "@/lib/db";
import { authed, canAccess } from "@/lib/auth";
import { enqueueEmail, flushEmails } from "@/lib/email";
import { closeOutQueue, templateVars } from "@/lib/automation";
import { getOrgSettings } from "@/lib/settings";
import { withDefaults } from "@/lib/templates";

const OUTCOMES = ["demo-booked", "interested", "callback", "not-interested", "do-not-call", "voicemail", "no-answer", "wrong-number", "completed"];

// Manually correct a call's outcome. Marking "demo-booked" sends the booking link email.
export const PATCH = authed(async (req, { params }, user) => {
  const [call] = await db.select().from(calls).where(eq(calls.id, params.id)).limit(1);
  if (!call || !canAccess(user, call.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { outcome } = await req.json().catch(() => ({}));
  if (!OUTCOMES.includes(outcome)) return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });

  await db.update(calls).set({ outcomeOverride: outcome }).where(eq(calls.id, call.id));
  let emailQueued = false;

  if (outcome === "demo-booked") {
    const [[contact], [campaign]] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.id, call.contactId)).limit(1),
      db.select().from(campaigns).where(eq(campaigns.id, call.campaignId)).limit(1),
    ]);
    const [owner] = await db.select().from(users).where(eq(users.id, call.ownerId)).limit(1);
    if (contact && campaign && owner) {
      if (contact.stage !== "demo-scheduled") {
        await db.update(contacts).set({ stage: "demo-requested", updatedAt: new Date() }).where(eq(contacts.id, contact.id));
      }
      await closeOutQueue(contact.id, "demo-booked");
      if (contact.email && !contact.emailOptOut && owner.bookingUrl) {
        const org = await getOrgSettings();
        emailQueued = await enqueueEmail({
          ownerId: owner.id,
          contact,
          campaignId: campaign.id,
          kind: "booking_link",
          dedupeKey: `booking_link:${contact.id}:${campaign.id}`,
          template: withDefaults(campaign.emailTemplates).booking_link,
          vars: templateVars(contact, owner, org, campaign.id),
          sendAt: new Date(),
          org,
        });
        await flushEmails({ contactId: contact.id, limit: 3 });
      }
    }
  }
  return NextResponse.json({ ok: true, emailQueued });
});
