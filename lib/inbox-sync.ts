import { and, asc, desc, eq, gt, inArray, isNull, like, lt, or, sql } from "drizzle-orm";
import {
  db, contacts, emails, inboundMessages, mailboxes, users,
  type Contact, type Mailbox, type ReplyIntent,
} from "@/lib/db";
import { withMailbox, stripQuoted, type MailMessage } from "@/lib/mail";
import { aiEnabled, classifyReply } from "@/lib/ai";
import { bouncedRecipient, classifyByRules, isBounce, templateReply } from "@/lib/reply-rules";
import { cancelEmails } from "@/lib/email";
import { advanceDeal, closeOutQueue } from "@/lib/automation";
import { personalizedBookingLink } from "@/lib/booking";
import { getOrgSettings } from "@/lib/settings";

const OVERLAP_MS = 2 * 60_000;
const PAGE = 50;

async function findOutbound(mb: Mailbox, m: MailMessage, fromEmail: string) {
  if (m.threadId) {
    const [byThread] = await db.select().from(emails)
      .where(and(eq(emails.mailboxId, mb.id), eq(emails.threadId, m.threadId), inArray(emails.status, ["sent", "scheduled"])))
      .orderBy(desc(emails.sentAt)).limit(1);
    if (byThread) return byThread;
  }
  const refs = `${m.inReplyTo ?? ""} ${m.references ?? ""}`.match(/<[^>]+>/g) ?? [];
  if (refs.length) {
    const [byRef] = await db.select().from(emails).where(and(eq(emails.mailboxId, mb.id), inArray(emails.messageIdHeader, refs))).limit(1);
    if (byRef) return byRef;
  }
  const [byAddress] = await db.select().from(emails)
    .where(and(
      eq(emails.ownerId, mb.userId),
      eq(sql`lower(${emails.toEmail})`, fromEmail),
      inArray(emails.status, ["sent", "scheduled"]),
      gt(emails.sentAt, new Date(Date.now() - 120 * 24 * 3600e3)),
    ))
    .orderBy(desc(emails.sentAt)).limit(1);
  return byAddress ?? null;
}

async function contactByEmail(ownerId: string, email: string): Promise<Contact | null> {
  const [own] = await db.select().from(contacts)
    .where(and(eq(contacts.ownerId, ownerId), eq(sql`lower(${contacts.email})`, email))).limit(1);
  return own ?? null;
}

async function handleBounce(mb: Mailbox, m: MailMessage) {
  const recipient = bouncedRecipient(m.text, m.headers);
  if (!recipient) return null;
  const [sent] = await db.select().from(emails)
    .where(and(eq(emails.mailboxId, mb.id), eq(sql`lower(${emails.toEmail})`, recipient)))
    .orderBy(desc(emails.sentAt)).limit(1);
  if (!sent) return null;
  await db.update(emails).set({ bouncedAt: new Date() }).where(eq(emails.id, sent.id));
  await db.update(contacts).set({ emailBounced: true, updatedAt: new Date() }).where(eq(contacts.id, sent.contactId));
  await cancelEmails(eq(emails.contactId, sent.contactId));
  return sent;
}

const NURTURE = or(like(emails.kind, "cold_%"), like(emails.kind, "post_call_%"));

/** Applies what a reply means for the prospect: stop the sequence, update stage, open a deal, honor opt-outs. */
export async function applyIntent(intent: ReplyIntent, contact: Contact, ownerId: string, campaignId: string | null, followUpDays: number | null) {
  if (intent === "out-of-office" || intent === "bounce") return;
  await cancelEmails(and(eq(emails.contactId, contact.id), NURTURE)!);
  await closeOutQueue(contact.id, `replied-${intent}`);

  const patch: Partial<Contact> = { updatedAt: new Date() };
  if (intent === "positive" || intent === "needs-info") {
    if (contact.stage !== "demo-scheduled") patch.stage = "interested";
  } else if (intent === "not-interested") {
    patch.stage = "not-interested";
    if (followUpDays) {
      const when = new Date(Date.now() + followUpDays * 24 * 3600e3);
      patch.needsFollowUp = `Asked to reconnect around ${when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`;
    }
  } else if (intent === "negative") {
    patch.stage = "not-interested";
    patch.emailOptOut = true;
  }
  await db.update(contacts).set(patch).where(eq(contacts.id, contact.id));

  if (intent === "positive") {
    await advanceDeal({ contactId: contact.id, ownerId, campaignId, stage: "positive", source: "reply" });
  }
}

async function ingestInbound(mb: Mailbox, m: MailMessage) {
  const fromEmail = m.from.email;
  if (!fromEmail || fromEmail === mb.email.toLowerCase()) return false;
  const [exists] = await db.select({ id: inboundMessages.id }).from(inboundMessages)
    .where(and(eq(inboundMessages.mailboxId, mb.id), eq(inboundMessages.providerMessageId, m.id))).limit(1);
  if (exists) return false;

  if (isBounce(fromEmail, m.subject)) {
    const sent = await handleBounce(mb, m);
    if (!sent) return false;
    await db.insert(inboundMessages).values({
      mailboxId: mb.id, ownerId: mb.userId, contactId: sent.contactId, emailId: sent.id, campaignId: sent.campaignId,
      providerMessageId: m.id, threadId: m.threadId, messageIdHeader: m.messageIdHeader,
      fromEmail, fromName: m.from.name, subject: m.subject, snippet: m.snippet.slice(0, 300), bodyText: m.text.slice(0, 20000),
      receivedAt: m.date, intent: "bounce", intentSource: "rules", confidence: 0.95, status: "archived",
    }).onConflictDoNothing();
    return true;
  }

  // Only replies from prospects are stored — personal mail in the inbox is never read past this point.
  const outbound = await findOutbound(mb, m, fromEmail);
  const contact = outbound
    ? (await db.select().from(contacts).where(eq(contacts.id, outbound.contactId)).limit(1))[0] ?? null
    : await contactByEmail(mb.userId, fromEmail);
  if (!contact) return false;

  const replyText = stripQuoted(m.text) || m.snippet;
  const [owner] = await db.select().from(users).where(eq(users.id, mb.userId)).limit(1);
  const org = await getOrgSettings();
  const bookingLink = personalizedBookingLink(owner.bookingUrl, owner.bookingProvider, contact, outbound?.campaignId);
  const firstName = (contact.contactName ?? m.from.name ?? "").split(" ")[0] || "there";

  let result: { intent: ReplyIntent; confidence: number; summary: string | null; suggestedReply: string; source: "ai" | "rules"; followUpDays: number | null };
  const rules = classifyByRules(fromEmail, m.subject, replyText);
  if (aiEnabled() && rules.intent !== "out-of-office") {
    try {
      const ai = await classifyReply({
        companyName: org.companyName,
        repName: owner.name,
        bookingLink,
        contactName: contact.contactName ?? m.from.name ?? "",
        clubName: contact.clubName,
        ourEmail: outbound ? { subject: outbound.subject, text: outbound.text } : null,
        reply: { subject: m.subject, text: replyText },
      });
      result = { ...ai, source: "ai" };
    } catch (e) {
      console.error("[inbox] AI classification failed, using rules:", e);
      result = { ...rules, summary: null, suggestedReply: templateReply(rules.intent, { firstName, repName: owner.name, bookingLink, companyName: org.companyName }), source: "rules", followUpDays: null };
    }
  } else {
    result = { ...rules, summary: null, suggestedReply: templateReply(rules.intent, { firstName, repName: owner.name, bookingLink, companyName: org.companyName }), source: "rules", followUpDays: null };
  }

  const inserted = await db.insert(inboundMessages).values({
    mailboxId: mb.id,
    ownerId: mb.userId,
    contactId: contact.id,
    emailId: outbound?.id ?? null,
    campaignId: outbound?.campaignId ?? null,
    providerMessageId: m.id,
    threadId: m.threadId,
    messageIdHeader: m.messageIdHeader,
    fromEmail,
    fromName: m.from.name,
    subject: m.subject,
    snippet: replyText.replace(/\s+/g, " ").slice(0, 300),
    bodyText: m.text.slice(0, 20000),
    receivedAt: m.date,
    intent: result.intent,
    intentSource: result.source,
    confidence: result.confidence,
    aiSummary: result.summary,
    suggestedReply: result.suggestedReply || null,
    suggestedReplySource: result.suggestedReply ? (result.source === "ai" ? "ai" : "template") : null,
    status: result.intent === "out-of-office" ? "archived" : "new",
  }).onConflictDoNothing().returning({ id: inboundMessages.id });
  if (!inserted.length) return false;

  if (outbound && !outbound.repliedAt && result.intent !== "out-of-office") {
    await db.update(emails).set({ repliedAt: m.date }).where(eq(emails.id, outbound.id));
  }
  await applyIntent(result.intent, contact, mb.userId, outbound?.campaignId ?? null, result.followUpDays);
  return true;
}

/** Records cold emails a rep sent by hand from their own inbox to people in their contact book. */
async function ingestSent(mb: Mailbox, m: MailMessage) {
  if (m.headers["x-waresport-id"]) return false;
  const [known] = await db.select({ id: emails.id }).from(emails)
    .where(or(
      and(eq(emails.mailboxId, mb.id), eq(emails.providerMessageId, m.id)),
      m.messageIdHeader ? eq(emails.messageIdHeader, m.messageIdHeader) : sql`false`,
    )).limit(1);
  if (known) return false;

  let added = false;
  for (const to of m.to) {
    const contact = await contactByEmail(mb.userId, to);
    if (!contact) continue;
    const res = await db.insert(emails).values({
      ownerId: mb.userId,
      contactId: contact.id,
      kind: "manual",
      dedupeKey: `manual:${mb.id}:${m.id}:${contact.id}`,
      toEmail: to,
      subject: m.subject,
      subjectTemplate: m.subject,
      html: "",
      text: m.text.slice(0, 20000),
      sendAt: m.date,
      sentAt: m.date,
      status: "sent",
      mailboxId: mb.id,
      providerMessageId: m.id,
      threadId: m.threadId,
      messageIdHeader: m.messageIdHeader,
    }).onConflictDoNothing({ target: emails.dedupeKey }).returning({ id: emails.id });
    if (res.length) added = true;
  }
  return added;
}

export async function syncMailbox(mb: Mailbox) {
  const stats = { replies: 0, manualSent: 0 };
  const inboxSince = new Date((mb.syncCursor ?? mb.createdAt).getTime() - OVERLAP_MS);
  const sentSince = new Date((mb.sentCursor ?? mb.createdAt).getTime() - OVERLAP_MS);

  try {
    const { inbox, sent } = await withMailbox(mb, async (api, token) => ({
      inbox: await api.list(token, "inbox", inboxSince, PAGE),
      sent: await api.list(token, "sent", sentSince, PAGE),
    }));

    let inboxCursor = mb.syncCursor ?? mb.createdAt;
    for (const m of inbox) {
      if (await ingestInbound(mb, m)) stats.replies++;
      if (m.date > inboxCursor) inboxCursor = m.date;
    }
    let sentCursor = mb.sentCursor ?? mb.createdAt;
    for (const m of sent) {
      if (await ingestSent(mb, m)) stats.manualSent++;
      if (m.date > sentCursor) sentCursor = m.date;
    }
    await db.update(mailboxes).set({
      lastSyncAt: new Date(), syncCursor: inboxCursor, sentCursor, status: "active", lastError: null,
    }).where(eq(mailboxes.id, mb.id));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.update(mailboxes).set({ lastSyncAt: new Date(), lastError: message }).where(eq(mailboxes.id, mb.id));
    console.error(`[inbox] sync failed for ${mb.email}:`, message);
  }
  return stats;
}

/** Scans connected inboxes that haven't been checked for `staleMs`, oldest first, until the deadline. */
export async function syncMailboxes(opts: { userId?: string; staleMs?: number; deadline: number }) {
  const stale = new Date(Date.now() - (opts.staleMs ?? 0));
  const rows = await db.select().from(mailboxes)
    .where(and(
      eq(mailboxes.status, "active"),
      opts.userId ? eq(mailboxes.userId, opts.userId) : undefined,
      or(isNull(mailboxes.lastSyncAt), lt(mailboxes.lastSyncAt, stale)),
    ))
    .orderBy(asc(sql`coalesce(${mailboxes.lastSyncAt}, 'epoch')`));
  const totals = { mailboxes: 0, replies: 0, manualSent: 0 };
  for (const mb of rows) {
    if (Date.now() > opts.deadline) break;
    const s = await syncMailbox(mb);
    totals.mailboxes++;
    totals.replies += s.replies;
    totals.manualSent += s.manualSent;
  }
  return totals;
}
