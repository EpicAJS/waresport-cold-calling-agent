import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, contacts, emails, inboundMessages, users } from "@/lib/db";
import { authed, canAccess } from "@/lib/auth";
import { aiEnabled, classifyReply } from "@/lib/ai";
import { templateReply } from "@/lib/reply-rules";
import { personalizedBookingLink } from "@/lib/booking";
import { getOrgSettings } from "@/lib/settings";
import { stripQuoted } from "@/lib/mail";

export const maxDuration = 30;

// Regenerates the suggested reply (AI when configured, otherwise the template for the current intent).
export const POST = authed(async (_req, { params }, user) => {
  const [msg] = await db.select().from(inboundMessages).where(eq(inboundMessages.id, params.id)).limit(1);
  if (!msg || !canAccess(user, msg.ownerId) || !msg.contactId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, msg.contactId)).limit(1);
  const [owner] = await db.select().from(users).where(eq(users.id, msg.ownerId)).limit(1);
  const [ours] = msg.emailId ? await db.select().from(emails).where(eq(emails.id, msg.emailId)).limit(1) : [];
  const org = await getOrgSettings();
  const bookingLink = personalizedBookingLink(owner.bookingUrl, owner.bookingProvider, contact, msg.campaignId);
  const firstName = (contact.contactName ?? msg.fromName ?? "").split(" ")[0] || "there";

  let text = templateReply(msg.intent ?? "other", { firstName, repName: owner.name, bookingLink, companyName: org.companyName });
  let source: "ai" | "template" = "template";
  if (aiEnabled()) {
    try {
      const ai = await classifyReply({
        companyName: org.companyName, repName: owner.name, bookingLink,
        contactName: contact.contactName ?? msg.fromName ?? "", clubName: contact.clubName,
        ourEmail: ours ? { subject: ours.subject, text: ours.text } : null,
        reply: { subject: msg.subject, text: stripQuoted(msg.bodyText) || msg.snippet },
      });
      if (ai.suggestedReply) { text = ai.suggestedReply; source = "ai"; }
    } catch (e) {
      console.error("[inbox] draft regeneration failed:", e);
    }
  }
  await db.update(inboundMessages).set({ suggestedReply: text || null, suggestedReplySource: text ? source : null }).where(eq(inboundMessages.id, msg.id));
  return NextResponse.json({ suggestedReply: text, source });
});
