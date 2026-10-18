import { and, asc, eq, gte, isNull, lt, lte, max, ne, or, sql } from "drizzle-orm";
import { db, calls, campaigns, campaignContacts, contacts, emails, users, type Campaign } from "@/lib/db";
import { FOLLOW_UP_PROTOCOL, getCall, isCallFinished, makeCall, stopCall } from "@/lib/bland";
import { maybeCompleteCampaign, processCallResult, startColdSequence } from "@/lib/automation";
import { flushEmails } from "@/lib/email";
import { getOrgSettings } from "@/lib/settings";
import { appUrl, isPublicUrl } from "@/lib/env";
import { businessDaysLater, contactTimeZone, isWeekday, localDayBounds, windowOnDay } from "@/lib/time";
import { priorTeammateContact, recordDedupBlock } from "@/lib/dedup";
import { syncMailboxes } from "@/lib/inbox-sync";
import { markDemosHeld, wakeSnoozed } from "@/lib/background";

const MIN_SPACING_MS = 2 * 60_000;
const BLOCKED_STAGES = ["do-not-call", "wrong-number", "not-interested", "demo-requested", "demo-scheduled"];

export function toE164(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? `+${digits}` : `+1${digits}`;
}

export function blandWebhookUrl() {
  const base = appUrl();
  if (!isPublicUrl(base)) return undefined;
  const token = process.env.WEBHOOK_SECRET ? `?token=${encodeURIComponent(process.env.WEBHOOK_SECRET)}` : "";
  return `${base}/api/webhooks/bland${token}`;
}

function spacingFor(c: Campaign, now: Date) {
  const w = windowOnDay(now, c.timezone, c.windowStart, c.windowEnd);
  const len = Math.max(w.end.getTime() - w.start.getTime(), 60 * 60_000);
  return Math.max(MIN_SPACING_MS, Math.floor(len / Math.max(c.maxPerDay, 1)));
}

/** Picks the next pending contacts that fit today's cap and calling window and yields a start time for each. */
async function* plan(c: Campaign, now: Date, usedToday: number, lastSlot: Date | null, requireEmail: boolean) {
  const remaining = c.maxPerDay - usedToday;
  if (remaining <= 0) return;
  const today = localDayBounds(now, c.timezone);

  const candidates = await db
    .select({ cc: campaignContacts, contact: contacts })
    .from(campaignContacts)
    .innerJoin(contacts, eq(campaignContacts.contactId, contacts.id))
    .where(and(
      eq(campaignContacts.campaignId, c.id),
      eq(campaignContacts.status, "pending"),
      or(isNull(campaignContacts.nextAttemptAt), lt(campaignContacts.nextAttemptAt, today.end)),
    ))
    .orderBy(asc(campaignContacts.attempts), asc(campaignContacts.createdAt))
    .limit(remaining * 4 + 20);

  const spacing = spacingFor(c, now);
  const cursors = new Map<string, number>();
  const { dedupWindowDays } = await getOrgSettings();
  let used = 0;

  for (const cand of candidates) {
    if (used >= remaining) break;
    const { contact } = cand;
    if (BLOCKED_STAGES.includes(contact.stage) || (requireEmail ? !contact.email || contact.emailOptOut : !contact.phone)) {
      await db.update(campaignContacts).set({ status: "skipped", lastOutcome: requireEmail ? "no-email" : "not-callable" })
        .where(eq(campaignContacts.id, cand.cc.id));
      continue;
    }
    if (cand.cc.attempts === 0) {
      const prior = await priorTeammateContact(contact, c.ownerId, dedupWindowDays);
      if (prior) {
        await recordDedupBlock({ contactId: contact.id, campaignId: c.id, blockedUserId: c.ownerId, prior });
        await db.update(campaignContacts).set({ status: "skipped", lastOutcome: "dedup-blocked" }).where(eq(campaignContacts.id, cand.cc.id));
        continue;
      }
    }
    const tz = contactTimeZone(contact, c.timezone);
    if (!isWeekday(now, tz)) continue;
    const w = windowOnDay(now, tz, c.windowStart, c.windowEnd);
    const cursor = cursors.get(tz) ?? (lastSlot ? lastSlot.getTime() + spacing : 0);
    const slot = Math.max(now.getTime() + 60_000, w.start.getTime(), cand.cc.nextAttemptAt?.getTime() ?? 0, cursor);
    if (slot > w.end.getTime() - 5 * 60_000) continue;
    cursors.set(tz, slot + spacing);
    used++;
    yield { ...cand, slot: new Date(slot), tz };
  }
}

async function dispatchCallCampaign(c: Campaign, now: Date, deadline: number) {
  const today = localDayBounds(now, c.timezone);
  const [{ used, last }] = await db
    .select({ used: sql<number>`count(*)::int`, last: max(calls.scheduledFor) })
    .from(calls)
    .where(and(eq(calls.campaignId, c.id), gte(calls.scheduledFor, today.start), lt(calls.scheduledFor, today.end), ne(calls.status, "cancelled")));

  const webhook = blandWebhookUrl();
  let placed = 0;
  for await (const { cc, contact, slot, tz } of plan(c, now, used, last ? new Date(last) : null, false)) {
    if (Date.now() > deadline) break;
    const attempt = cc.attempts + 1;
    const [row] = await db.insert(calls).values({
      ownerId: c.ownerId, campaignId: c.id, contactId: contact.id, attempt, scheduledFor: slot,
    }).returning({ id: calls.id });

    try {
      const { call_id } = await makeCall({
        phone_number: toE164(contact.phone),
        task: c.script + FOLLOW_UP_PROTOCOL,
        voice: c.voiceId,
        from: c.fromNumber,
        webhook,
        start_time: slot.getTime() > Date.now() + 90_000 ? slot : undefined,
        metadata: { call_row_id: row.id, campaign_id: c.id, contact_id: contact.id, club_name: contact.clubName },
      });
      await db.update(calls).set({ blandCallId: call_id }).where(eq(calls.id, row.id));
      await db.update(campaignContacts).set({ status: "scheduled", attempts: attempt }).where(eq(campaignContacts.id, cc.id));
      placed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.update(calls).set({ status: "failed", outcome: "failed", error: message, processedAt: new Date() }).where(eq(calls.id, row.id));
      const retry = attempt < 1 + c.maxRetries;
      await db.update(campaignContacts).set({
        attempts: attempt,
        lastOutcome: "failed",
        status: retry ? "pending" : "done",
        nextAttemptAt: retry ? businessDaysLater(now, 1, tz, c.windowStart) : null,
      }).where(eq(campaignContacts.id, cc.id));
    }
  }
  return placed;
}

async function dispatchEmailCampaign(c: Campaign, now: Date, deadline: number) {
  const today = localDayBounds(now, c.timezone);
  const [{ used, last }] = await db
    .select({ used: sql<number>`count(*)::int`, last: max(emails.sendAt) })
    .from(emails)
    .where(and(eq(emails.campaignId, c.id), eq(emails.kind, "cold_1"), gte(emails.sendAt, today.start), lt(emails.sendAt, today.end)));

  const [owner] = await db.select().from(users).where(eq(users.id, c.ownerId)).limit(1);
  if (!owner) return 0;
  const org = await getOrgSettings();
  let started = 0;
  for await (const { cc, contact, slot } of plan(c, now, used, last ? new Date(last) : null, true)) {
    if (Date.now() > deadline) break;
    await startColdSequence(c, contact, owner, org, slot);
    await db.update(campaignContacts).set({ status: "done", attempts: 1, lastOutcome: "emailed" }).where(eq(campaignContacts.id, cc.id));
    started++;
  }
  if (started) await flushEmails({ deadline, limit: started * 4 });
  return started;
}

export async function dispatchCampaign(campaignId: string, deadline = Date.now() + 45_000) {
  const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "active"))).limit(1);
  if (!c) return 0;
  const now = new Date();
  const n = c.channel === "email" ? await dispatchEmailCampaign(c, now, deadline) : await dispatchCallCampaign(c, now, deadline);
  if (c.channel === "email") await maybeCompleteCampaign(c.id);
  return n;
}

/** Catches calls whose webhook never arrived (e.g. running locally) by polling Bland. */
export async function syncStaleCalls(opts: { campaignId?: string; deadline?: number; ownerId?: string } = {}) {
  const conds = [
    eq(calls.status, "scheduled"),
    isNull(calls.processedAt),
    lte(calls.scheduledFor, new Date(Date.now() - 2 * 60_000)),
    sql`${calls.blandCallId} is not null`,
  ];
  if (opts.campaignId) conds.push(eq(calls.campaignId, opts.campaignId));
  if (opts.ownerId) conds.push(eq(calls.ownerId, opts.ownerId));
  const stale = await db.select({ id: calls.id, blandCallId: calls.blandCallId }).from(calls).where(and(...conds)).limit(50);

  let synced = 0;
  for (const s of stale) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    try {
      const bc = await getCall(s.blandCallId!);
      if (!isCallFinished(bc)) continue;
      const r = await processCallResult(s.id, bc);
      if (r.processed) synced++;
    } catch (e) {
      console.error("[sync] call", s.blandCallId, e);
    }
  }
  return synced;
}

/** Cancels calls queued for later so a paused campaign stops dialing. */
export async function cancelFutureCalls(campaignId: string) {
  const future = await db
    .select({ id: calls.id, blandCallId: calls.blandCallId, contactId: calls.contactId })
    .from(calls)
    .where(and(eq(calls.campaignId, campaignId), eq(calls.status, "scheduled"), isNull(calls.processedAt),
      gte(calls.scheduledFor, new Date(Date.now() + 60_000))));

  let cancelled = 0;
  let notStopped = 0;
  for (const f of future) {
    const stopped = f.blandCallId ? await stopCall(f.blandCallId) : true;
    if (!stopped) { notStopped++; continue; }
    await db.update(calls).set({ status: "cancelled", outcome: "cancelled", processedAt: new Date() }).where(eq(calls.id, f.id));
    await db.update(campaignContacts)
      .set({ status: "pending", attempts: sql`greatest(${campaignContacts.attempts} - 1, 0)` })
      .where(and(eq(campaignContacts.campaignId, campaignId), eq(campaignContacts.contactId, f.contactId)));
    cancelled++;
  }
  return { cancelled, notStopped };
}

/** One full pass of background work. Safe to run as often as every minute or as rarely as once a day. */
export async function runScheduledWork(budgetMs = 50_000) {
  const deadline = Date.now() + budgetMs;
  const synced = await syncStaleCalls({ deadline: Date.now() + budgetMs * 0.2 });
  const inboxes = await syncMailboxes({ staleMs: 60_000, deadline: Date.now() + budgetMs * 0.4 });
  const woke = await wakeSnoozed();
  await markDemosHeld();

  const active = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.status, "active"));
  let dispatched = 0;
  for (const c of active) {
    if (Date.now() > deadline) break;
    dispatched += await dispatchCampaign(c.id, deadline);
  }
  const emailResult = await flushEmails({ deadline, limit: 200 });
  return { synced, inboxes, woke, dispatched, emails: emailResult };
}
