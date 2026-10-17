import { and, asc, eq, gt, inArray, isNotNull, lte, sql, SQL } from "drizzle-orm";
import { db, emails, contacts, campaigns, users, type Email, type EmailTemplate, type Mailbox } from "@/lib/db";
import { getOrgSettings, type OrgSettings } from "@/lib/settings";
import { renderEmail, type TemplateVars } from "@/lib/templates";
import { sign } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { activeMailboxFor, MailAuthError, replySubject, withMailbox } from "@/lib/mail";
import { addTracking, trackingEnabled } from "@/lib/tracking";
import { cancelResendScheduled, relayFor, relaySender } from "@/lib/relay";

// Resend can hold scheduled emails for a limited window, so only hand over emails due soon.
const SCHEDULE_HORIZON_MS = 47 * 60 * 60 * 1000;
// A send that was claimed but never finished (server restarted mid-send) is given up on after this.
const STALE_SEND_MS = 10 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function unsubscribeUrl(contactId: string, oneClick = false) {
  return `${appUrl()}/${oneClick ? "api/unsubscribe" : "unsubscribe"}?c=${contactId}&s=${sign(contactId)}`;
}

/** One-off transactional email (invites, password resets, tests). */
export async function sendSimpleEmail(to: string, subject: string, text: string, org?: OrgSettings) {
  const s = org ?? (await getOrgSettings());
  const relay = relayFor(s);
  if (!relay) return { ok: false as const, error: "System email isn't set up (Settings → Company & system email)." };
  const html = text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return relay.send({ fromName: s.companyName, fromEmail: s.fromEmail, to, subject, text, html });
}

/** Marks a pending email as being sent; false if another run already took it. */
async function claim(id: string) {
  const rows = await db.update(emails).set({ status: "sending", sentAt: new Date() })
    .where(and(eq(emails.id, id), eq(emails.status, "pending"))).returning({ id: emails.id });
  return rows.length > 0;
}

async function release(id: string, error: string) {
  await db.update(emails).set({ status: "pending", sentAt: null, error }).where(and(eq(emails.id, id), eq(emails.status, "sending")));
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
 * (sent at their due time); otherwise through the relay (Amazon SES or Resend). Each email is claimed before
 * sending, so overlapping runs (scheduler + open browser tabs) never send it twice.
 */
export async function flushEmails(opts: { contactId?: string; limit?: number; deadline?: number } = {}) {
  const org = await getOrgSettings();
  const relay = relayFor(org);
  const result = { sent: 0, scheduled: 0, failed: 0, skipped: 0, waiting: 0 };

  await db.update(emails)
    .set({ status: "failed", error: "Interrupted while sending; it may not have gone out." })
    .where(and(eq(emails.status, "sending"), lte(emails.sentAt, new Date(Date.now() - STALE_SEND_MS))));

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
      if (!(await claim(e.id))) continue;
      try {
        await sendViaMailbox(e, mb, repName, org);
        sentToday.set(mb.id, count + 1);
        result.sent++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof MailAuthError) {
          boxes.set(boxKey, null);
          await release(e.id, `Inbox needs reconnecting: ${message}`);
          result.waiting++;
        } else {
          await db.update(emails).set({ status: "failed", error: message }).where(eq(emails.id, e.id));
          result.failed++;
        }
      }
      continue;
    }

    if (!relay) {
      if (!e.error) await db.update(emails).set({ error: "Waiting for a connected inbox" }).where(eq(emails.id, e.id));
      result.waiting++;
      continue;
    }

    const scheduleLater = e.sendAt.getTime() > Date.now() + 60_000;
    if (scheduleLater && !relay.canSchedule) continue;
    if (!(await claim(e.id))) continue;
    const html = org.trackOpens && trackingEnabled() ? addTracking(e.html, e.id) : e.html;
    const res = await relay.send({
      ...relaySender(org, { name: repName, email: repEmail }),
      to: e.toEmail,
      replyTo: repEmail,
      subject: e.subject,
      html,
      text: e.text,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl(e.contactId, true)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      sendAt: scheduleLater ? e.sendAt : undefined,
      idempotencyKey: e.id,
    });
    if (res.ok) {
      await db
        .update(emails)
        .set({ status: scheduleLater ? "scheduled" : "sent", resendId: res.id, sentAt: scheduleLater ? e.sendAt : new Date(), error: null })
        .where(eq(emails.id, e.id));
      if (scheduleLater) result.scheduled++;
      else result.sent++;
    } else if (res.retryLater) {
      await release(e.id, res.error);
      result.waiting++;
      break; // provider is throttling or down; try again on the next run
    } else {
      await db.update(emails).set({ status: "failed", error: res.error }).where(eq(emails.id, e.id));
      result.failed++;
    }
    await sleep(relay.gapMs);
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
      if (!(await cancelResendScheduled(org.resendApiKey, r.resendId))) continue;
    }
    await db.update(emails).set({ status: "cancelled" }).where(eq(emails.id, r.id));
    cancelled++;
  }
  return cancelled;
}
