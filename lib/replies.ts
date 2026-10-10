import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, contacts, emails, inboundMessages, users } from "@/lib/db";
import { activeMailboxFor, replySubject, withMailbox } from "@/lib/mail";
import { unsubscribeUrl } from "@/lib/email";

function textToHtml(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111827">${esc
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br/>")}</p>`)
    .join("")}</div>`;
}

/** Sends a reply in the same thread as an inbound message, from the inbox it arrived in. */
export async function sendReply(inboundId: string, text: string) {
  const [msg] = await db.select().from(inboundMessages).where(eq(inboundMessages.id, inboundId)).limit(1);
  if (!msg || !msg.contactId) throw new Error("Message not found");
  const [owner] = await db.select().from(users).where(eq(users.id, msg.ownerId)).limit(1);
  const mb = await activeMailboxFor(msg.ownerId, msg.mailboxId);
  if (!mb || mb.id !== msg.mailboxId) throw new Error("The inbox this reply came to isn't connected anymore — reconnect it in Settings.");

  const subject = replySubject(msg.subject || "Following up");
  const sent = await withMailbox(mb, (api, token) => api.send(token, {
    fromName: owner.name,
    fromEmail: mb.email,
    to: msg.fromEmail,
    subject,
    html: textToHtml(text),
    text,
    thread: { threadId: msg.threadId, messageIdHeader: msg.messageIdHeader, providerMessageId: msg.providerMessageId },
  }));
  const now = new Date();
  await db.insert(emails).values({
    ownerId: msg.ownerId, contactId: msg.contactId, campaignId: msg.campaignId, kind: "reply",
    dedupeKey: `reply:${msg.id}:${randomUUID()}`, toEmail: msg.fromEmail, subject, subjectTemplate: null,
    html: textToHtml(text), text, sendAt: now, sentAt: now, status: "sent",
    mailboxId: mb.id, providerMessageId: sent.id, threadId: sent.threadId, messageIdHeader: sent.messageIdHeader,
  });
  await db.update(inboundMessages).set({ status: "replied", handledAt: now }).where(eq(inboundMessages.id, msg.id));
}

/** Sends a one-off email to a contact, continuing the latest thread with them when there is one. */
export async function composeToContact(contactId: string, userId: string, text: string, subject?: string) {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact?.email) throw new Error("This contact has no email address.");
  if (contact.emailOptOut) throw new Error("This contact unsubscribed from emails.");
  const [owner] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const mb = await activeMailboxFor(userId);
  if (!mb) throw new Error("Connect your Gmail or Outlook inbox in Settings first.");

  const [last] = await db.select().from(emails)
    .where(and(eq(emails.contactId, contactId), eq(emails.mailboxId, mb.id), inArray(emails.status, ["sent"]), isNotNull(emails.threadId)))
    .orderBy(desc(emails.sentAt)).limit(1);
  const subj = subject?.trim() || (last ? replySubject(last.subject) : `Quick follow-up for ${contact.clubName}`);
  const footer = `\n\n--\nUnsubscribe: ${unsubscribeUrl(contact.id)}`;

  const sent = await withMailbox(mb, (api, token) => api.send(token, {
    fromName: owner.name, fromEmail: mb.email, to: contact.email!, subject: subj,
    html: textToHtml(text) + `<p style="font-size:12px;color:#6b7280"><a href="${unsubscribeUrl(contact.id)}" style="color:#6b7280">Unsubscribe</a></p>`,
    text: text + footer,
    thread: last && !subject?.trim() ? { threadId: last.threadId, messageIdHeader: last.messageIdHeader, providerMessageId: last.providerMessageId } : undefined,
  }));
  const now = new Date();
  await db.insert(emails).values({
    ownerId: userId, contactId, campaignId: last?.campaignId ?? null, kind: "followup",
    dedupeKey: `followup:${contactId}:${randomUUID()}`, toEmail: contact.email, subject: subj, subjectTemplate: subj,
    html: textToHtml(text), text, sendAt: now, sentAt: now, status: "sent",
    mailboxId: mb.id, providerMessageId: sent.id, threadId: sent.threadId, messageIdHeader: sent.messageIdHeader,
  });
}
