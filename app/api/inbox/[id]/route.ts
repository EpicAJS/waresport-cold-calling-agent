import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, campaigns, contacts, emails, inboundMessages, mailboxes, users, type ReplyIntent } from "@/lib/db";
import { authed, canAccess } from "@/lib/auth";
import { applyIntent } from "@/lib/inbox-sync";
import { inboxSelect } from "@/lib/inbox";

const INTENTS: ReplyIntent[] = ["positive", "needs-info", "not-interested", "negative", "out-of-office", "other"];

async function load(id: string) {
  const [row] = await db.select({ ...inboxSelect, bodyText: inboundMessages.bodyText, campaignId: inboundMessages.campaignId })
    .from(inboundMessages)
    .innerJoin(users, eq(inboundMessages.ownerId, users.id))
    .innerJoin(mailboxes, eq(inboundMessages.mailboxId, mailboxes.id))
    .leftJoin(contacts, eq(inboundMessages.contactId, contacts.id))
    .leftJoin(campaigns, eq(inboundMessages.campaignId, campaigns.id))
    .where(eq(inboundMessages.id, id)).limit(1);
  return row ?? null;
}

export const GET = authed(async (_req, { params }, user) => {
  const msg = await load(params.id);
  if (!msg || !canAccess(user, msg.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The conversation with this contact: our sent emails and their replies, oldest first.
  const thread = msg.contactId ? [
    ...(await db.select({ id: emails.id, at: emails.sentAt, subject: emails.subject, text: emails.text, kind: emails.kind })
      .from(emails).where(and(eq(emails.contactId, msg.contactId), inArray(emails.status, ["sent", "scheduled"]))).orderBy(asc(emails.sentAt)))
      .map((e) => ({ ...e, direction: "out" as const })),
    ...(await db.select({ id: inboundMessages.id, at: inboundMessages.receivedAt, subject: inboundMessages.subject, text: inboundMessages.bodyText, kind: inboundMessages.intent })
      .from(inboundMessages).where(eq(inboundMessages.contactId, msg.contactId)))
      .map((e) => ({ ...e, direction: "in" as const })),
  ].sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime()) : [];

  return NextResponse.json({ ...msg, thread });
});

export const PATCH = authed(async (req, { params }, user) => {
  const msg = await load(params.id);
  if (!msg || !canAccess(user, msg.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const patch: Partial<typeof inboundMessages.$inferInsert> = {};

  if (body.status === "archived" || body.status === "new") {
    patch.status = body.status;
    patch.handledAt = body.status === "archived" ? new Date() : null;
    patch.snoozedUntil = null;
  }
  if (body.status === "snoozed") {
    const days = Math.min(Math.max(Number(body.snoozeDays) || 7, 1), 365);
    patch.status = "snoozed";
    patch.snoozedUntil = new Date(Date.now() + days * 24 * 3600e3);
  }
  if (typeof body.suggestedReply === "string") patch.suggestedReply = body.suggestedReply.slice(0, 8000);
  if (typeof body.intent === "string" && INTENTS.includes(body.intent) && body.intent !== msg.intent) {
    patch.intent = body.intent;
    patch.intentSource = "manual";
    if (msg.contactId) {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, msg.contactId)).limit(1);
      if (contact) await applyIntent(body.intent, contact, msg.ownerId, msg.campaignId, null);
    }
  }
  if (Object.keys(patch).length) await db.update(inboundMessages).set(patch).where(eq(inboundMessages.id, msg.id));
  return NextResponse.json({ ok: true });
});
