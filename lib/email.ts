import { and, asc, eq, gt, inArray, isNotNull, lte, sql, SQL } from "drizzle-orm";
import { db, emails, contacts, campaigns, users, type Email, type EmailTemplate, type Mailbox } from "@/lib/db";
import { getOrgSettings, type OrgSettings } from "@/lib/settings";
import { renderEmail, type TemplateVars } from "@/lib/templates";
import { sign } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { activeMailboxFor, MailAuthError, replySubject, withMailbox } from "@/lib/mail";
import { addTracking, trackingEnabled } from "@/lib/tracking";

const RESEND = "https://api.resend.com";
// Resend can hold scheduled emails for a limited window, so only hand over emails due soon.
const SCHEDULE_HORIZON_MS = 47 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function unsubscribeUrl(contactId: string, oneClick = false) {
  return `${appUrl()}/${oneClick ? "api/unsubscribe" : "unsubscribe"}?c=${contactId}&s=${sign(contactId)}`;
}

export async function resendSend(
  apiKey: string,
  body: Record<string, unknown>,
  idempotencyKey?: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const res = await fetch(`${RESEND}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.message ?? data.error ?? `HTTP ${res.status}` };
  return { ok: true, id: data.id };
}

/** One-off transactional email (invites, tests). */
export async function sendSimpleEmail(to: string, subject: string, text: string, org?: OrgSettings) {
  const s = org ?? (await getOrgSettings());
  if (!s.resendApiKey || !s.fromEmail) return { ok: false as const, error: "Email is not configured (Settings → Company)." };
  const html = text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return resendSend(s.resendApiKey, { from: `${s.companyName} <${s.fromEmail}>`, to, subject, text, html });
}

export async function enqueueEmail(opts: {
  ownerId: string;
  contact: { id: string; email: string | null };
  campaignId?: string | null;
  bookingId?: string | null;
  kind: string;
  dedupeKey: string;
  template: EmailTemplate;
  vars: TemplateVars;
  sendAt: Date;
  org: OrgSettings;
}) {
  if (!opts.contact.email) return false;
  const rendered = renderEmail(opts.template, opts.vars, {
    companyName: opts.org.companyName,
    mailingAddress: opts.org.mailingAddress,
    unsubscribeUrl: unsubscribeUrl(opts.contact.id),
  });
  const inserted = await db
    .insert(emails)
    .values({
      ownerId: opts.ownerId,
      contactId: opts.contact.id,
      campaignId: opts.campaignId ?? null,
      bookingId: opts.bookingId ?? null,
      kind: opts.kind,
      dedupeKey: opts.dedupeKey,
      toEmail: opts.contact.email,
      subject: rendered.subject,
      subjectTemplate: opts.template.subject,
      html: rendered.html,
      text: rendered.text,
      sendAt: opts.sendAt,
    })
    .onConflictDoNothing({ target: emails.dedupeKey })
    .returning({ id: emails.id });
  return inserted.length > 0;
}

/** Finds the first email of the same sequence so follow-ups can continue that thread. */
async function threadFor(e: Email, mailboxId: string) {
  const m = e.kind.match(/^(cold|post_call)_(\d+)$/);
  if (!m || m[2] === "1" || !e.campaignId) return null;
  const [first] = await db
    .select({ threadId: emails.threadId, messageIdHeader: emails.messageIdHeader, providerMessageId: emails.providerMessageId, subject: emails.subject })
    .from(emails)
    .where(and(
      eq(emails.contactId, e.contactId),
      eq(emails.campaignId, e.campaignId),
      eq(emails.mailboxId, mailboxId),
      eq(emails.kind, `${m[1]}_1`),
      isNotNull(emails.threadId),
    ))
    .limit(1);
  return first ?? null;
}

async function sendViaMailbox(e: Email, mb: Mailbox, repName: string, org: OrgSettings) {
  const first = await threadFor(e, mb.id);
  // Only thread when the follow-up reads as a reply; a brand-new subject starts a fresh conversation.
  const threaded = first && (!e.subject.trim() || /^re:/i.test(e.subject.trim()));
  const subject = threaded ? replySubject(first.subject) : e.subject;
  const html = org.trackOpens && trackingEnabled() ? addTracking(e.html, e.id) : e.html;

  const sent = await withMailbox(mb, (api, token) => api.send(token, {
    fromName: repName,
    fromEmail: mb.email,
    to: e.toEmail,
    subject,
    html,
    text: e.text,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl(e.contactId, true)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Waresport-Id": e.id,
    },
    thread: threaded ? first : undefined,
  }));
  await db.update(emails).set({
    status: "sent",
    sentAt: new Date(),
    mailboxId: mb.id,
    providerMessageId: sent.id,
    threadId: sent.threadId,
    messageIdHeader: sent.messageIdHeader,
    subject,
    error: null,
  }).where(eq(emails.id, e.id));
}

async function sentInLastDay(mailboxId: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(emails)
    .where(and(eq(emails.mailboxId, mailboxId), eq(emails.status, "sent"), gt(emails.sentAt, new Date(Date.now() - 24 * 3600e3))));
  return n;
}

/**
 * Sends due emails. Emails go out through the owner's connected Gmail/Outlook inbox when there is one
 * (sent at their due time); otherwise through Resend, which can also hold emails due in the next ~2 days.
 */
export async function flushEmails(opts: { contactId?: string; limit?: number; deadline?: number } = {}) {
  const org = await getOrgSettings();
  const resendReady = Boolean(org.resendApiKey && org.fromEmail);
  const result = { sent: 0, scheduled: 0, failed: 0, skipped: 0, waiting: 0 };

  const horizon = new Date(Date.now() + SCHEDULE_HORIZON_MS);
  const conds: SQL[] = [eq(emails.status, "pending"), lte(emails.sendAt, horizon)];
  if (opts.contactId) conds.push(eq(emails.contactId, opts.contactId));

  const due = await db
    .select({
      email: emails,
      optOut: contacts.emailOptOut,
      bounced: contacts.emailBounced,
      repName: users.name,
      repEmail: users.email,
      campaignMailboxId: campaigns.mailboxId,
    })
    .from(emails)
    .innerJoin(contacts, eq(emails.contactId, contacts.id))
    .innerJoin(users, eq(emails.ownerId, users.id))
    .leftJoin(campaigns, eq(emails.campaignId, campaigns.id))
    .where(and(...conds))
    .orderBy(asc(emails.sendAt))
    .limit(opts.limit ?? 100);

  const boxes = new Map<string, Mailbox | null>();
  const sentToday = new Map<string, number>();

  for (const { email: e, optOut, bounced, repName, repEmail, campaignMailboxId } of due) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    if (optOut || bounced) {
      await db.update(emails).set({ status: "cancelled", error: optOut ? "Contact unsubscribed" : "Address bounced" }).where(eq(emails.id, e.id));
      result.skipped++;
      continue;
    }

    const boxKey = `${e.ownerId}:${campaignMailboxId ?? ""}`;
    if (!boxes.has(boxKey)) boxes.set(boxKey, await activeMailboxFor(e.ownerId, campaignMailboxId));
    const mb = boxes.get(boxKey)!;

    if (mb) {
      if (e.sendAt.getTime() > Date.now() + 60_000) continue;
      const count = sentToday.get(mb.id) ?? (await sentInLastDay(mb.id));
      if (count >= org.mailboxDailyLimit) {
        result.waiting++;
        continue;
      }
      try {
        await sendViaMailbox(e, mb, repName, org);
        sentToday.set(mb.id, count + 1);
        result.sent++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof MailAuthError) {
          boxes.set(boxKey, null);
          await db.update(emails).set({ error: `Inbox needs reconnecting: ${message}` }).where(eq(emails.id, e.id));
          result.waiting++;
        } else {
          await db.update(emails).set({ status: "failed", error: message }).where(eq(emails.id, e.id));
          result.failed++;
        }
      }
      continue;
    }

    if (!resendReady) {
      if (!e.error) await db.update(emails).set({ error: "Waiting for a connected inbox" }).where(eq(emails.id, e.id));
      result.waiting++;
      continue;
    }

    const scheduleLater = e.sendAt.getTime() > Date.now() + 60_000;
    const html = org.trackOpens && trackingEnabled() ? addTracking(e.html, e.id) : e.html;
    const res = await resendSend(
      org.resendApiKey,
      {
        from: `${repName} at ${org.companyName} <${org.fromEmail}>`,
        to: e.toEmail,
        reply_to: repEmail,
        subject: e.subject,
        html,
        text: e.text,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl(e.contactId, true)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        ...(scheduleLater ? { scheduled_at: e.sendAt.toISOString() } : {}),
      },
      e.id
    );
    if (res.ok) {
      await db
        .update(emails)
        .set({ status: scheduleLater ? "scheduled" : "sent", resendId: res.id, sentAt: scheduleLater ? e.sendAt : new Date(), error: null })
        .where(eq(emails.id, e.id));
      if (scheduleLater) result.scheduled++;
      else result.sent++;
    } else {
      await db.update(emails).set({ status: "failed", error: res.error }).where(eq(emails.id, e.id));
      result.failed++;
    }
    await sleep(550); // stay under Resend's default 2 requests/second
  }
  return result;
}

/** Cancels queued emails matching `where`, including ones already handed to Resend. */
export async function cancelEmails(where: SQL) {
  const rows = await db
    .select({ id: emails.id, status: emails.status, resendId: emails.resendId, sendAt: emails.sendAt })
    .from(emails)
    .where(and(where, inArray(emails.status, ["pending", "scheduled"])));
  if (rows.length === 0) return 0;

  const org = await getOrgSettings();
  let cancelled = 0;
  for (const r of rows) {
    if (r.status === "scheduled") {
      if (r.sendAt.getTime() <= Date.now() || !r.resendId || !org.resendApiKey) continue;
      const res = await fetch(`${RESEND}/emails/${r.resendId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${org.resendApiKey}` },
      }).catch(() => null);
      if (!res?.ok) continue;
    }
    await db.update(emails).set({ status: "cancelled" }).where(eq(emails.id, r.id));
    cancelled++;
  }
  return cancelled;
}
