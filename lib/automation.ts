import { and, desc, eq, gt, inArray, isNull, like, notLike, or, sql } from "drizzle-orm";
import {
  db, calls, contacts, campaigns, campaignContacts, bookings, emails, users,
  type Contact, type Campaign, type User,
} from "@/lib/db";
import { analysisString, formatTranscript, inferOutcome, stopCall, RETRYABLE_OUTCOMES, type BlandCall, type Outcome } from "@/lib/bland";
import { enqueueEmail, flushEmails, cancelEmails } from "@/lib/email";
import { getOrgSettings, type OrgSettings } from "@/lib/settings";
import { withDefaults, DEFAULT_TEMPLATES, type TemplateVars } from "@/lib/templates";
import { personalizedBookingLink } from "@/lib/booking";
import { businessDaysLater, contactTimeZone, formatInTz, shiftBusinessDays } from "@/lib/time";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase().replace(/\s+/g, "").replace(/\(at\)|\[at\]/g, "@").replace(/\.$/, "");
  return EMAIL_RE.test(e) ? e : null;
}

export function digitsOnly(raw: string | null | undefined) {
  return (raw ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

export function templateVars(
  contact: Pick<Contact, "id" | "clubName" | "contactName" | "email">,
  owner: Pick<User, "name" | "email" | "bookingUrl" | "bookingProvider">,
  org: OrgSettings,
  campaignId?: string | null,
  extra: TemplateVars = {}
): TemplateVars {
  return {
    club_name: contact.clubName,
    contact_name: contact.contactName?.split(" ")[0] || "there",
    rep_name: owner.name,
    rep_email: owner.email,
    company_name: org.companyName,
    booking_link: personalizedBookingLink(owner.bookingUrl, owner.bookingProvider, contact, campaignId),
    ...extra,
  };
}

async function enqueueSequence(opts: {
  prefix: "post_call" | "cold";
  steps: Array<{ subject: string; body: string; delay_days: number }>;
  start: Date;
  tz: string;
  contact: Contact;
  owner: User;
  campaign: Campaign;
  org: OrgSettings;
}) {
  const vars = templateVars(opts.contact, opts.owner, opts.org, opts.campaign.id);
  let queued = 0;
  for (const [i, step] of opts.steps.entries()) {
    const ok = await enqueueEmail({
      ownerId: opts.owner.id,
      contact: opts.contact,
      campaignId: opts.campaign.id,
      kind: `${opts.prefix}_${i + 1}`,
      dedupeKey: `${opts.prefix}_${i + 1}:${opts.contact.id}:${opts.campaign.id}`,
      template: step,
      vars,
      sendAt: shiftBusinessDays(opts.start, step.delay_days, opts.tz),
      org: opts.org,
    });
    if (ok) queued++;
  }
  return queued;
}

function stageFor(outcome: Outcome, current: string): string {
  if (current === "demo-scheduled" || current === "do-not-call") return current;
  switch (outcome) {
    case "demo-booked": return "demo-requested";
    case "interested":
    case "callback": return "interested";
    case "not-interested": return "not-interested";
    case "do-not-call": return "do-not-call";
    case "wrong-number": return "wrong-number";
    default: return current === "new" ? "contacted" : current;
  }
}

/**
 * Applies a finished Bland call exactly once: stores the result, updates the contact,
 * schedules a retry or closes the contact out, and queues follow-up emails.
 */
export async function processCallResult(callRowId: string, bc: BlandCall) {
  const outcome = inferOutcome(bc);
  const endedAt = bc.end_at || bc.ended_at ? new Date((bc.end_at || bc.ended_at) as string) : new Date();

  const [call] = await db
    .update(calls)
    .set({
      status: outcome === "failed" ? "failed" : "completed",
      outcome,
      durationSec: Math.round((bc.call_length ?? 0) * 60),
      summary: bc.summary ?? null,
      transcript: formatTranscript(bc) || null,
      recordingUrl: bc.recording_url ?? null,
      analysis: bc.analysis ?? null,
      error: bc.error_message ?? null,
      endedAt: isNaN(endedAt.getTime()) ? new Date() : endedAt,
      processedAt: new Date(),
    })
    .where(and(eq(calls.id, callRowId), isNull(calls.processedAt)))
    .returning();
  if (!call) return { processed: false, outcome };

  const [[contact], [campaign], [cc]] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.id, call.contactId)).limit(1),
    db.select().from(campaigns).where(eq(campaigns.id, call.campaignId)).limit(1),
    db.select().from(campaignContacts)
      .where(and(eq(campaignContacts.campaignId, call.campaignId), eq(campaignContacts.contactId, call.contactId))).limit(1),
  ]);
  if (!contact || !campaign) return { processed: true, outcome };
  const [owner] = await db.select().from(users).where(eq(users.id, campaign.ownerId)).limit(1);

  const capturedEmail = normalizeEmail(analysisString(bc, "contact_email"));
  const capturedPhone = digitsOnly(analysisString(bc, "contact_phone"));
  const capturedName = analysisString(bc, "contact_name");
  const callbackTime = analysisString(bc, "callback_time");

  let needsFollowUp: string | null = contact.needsFollowUp;
  const email = capturedEmail ?? contact.email;
  if (outcome === "demo-booked" && !email) {
    needsFollowUp = "Wants a demo but no email was captured — call back to get their email.";
  } else if (outcome === "demo-booked" && !owner?.bookingUrl) {
    needsFollowUp = `Wants a demo — send ${email} a booking link (no booking link is set in Settings).`;
  } else if (outcome === "callback") {
    needsFollowUp = `Asked for a callback${callbackTime ? `: ${callbackTime}` : ""}.`;
  }

  const [updated] = await db
    .update(contacts)
    .set({
      email,
      altPhone: capturedPhone && capturedPhone !== digitsOnly(contact.phone) ? capturedPhone : contact.altPhone,
      contactName: capturedName || contact.contactName,
      stage: stageFor(outcome, contact.stage),
      needsFollowUp,
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, contact.id))
    .returning();

  const tz = contactTimeZone(contact, campaign.timezone);
  const willRetry = RETRYABLE_OUTCOMES.includes(outcome) && (cc?.attempts ?? 1) < 1 + campaign.maxRetries;
  if (cc) {
    await db
      .update(campaignContacts)
      .set(
        willRetry
          ? { status: "pending", lastOutcome: outcome, nextAttemptAt: businessDaysLater(new Date(), 1, tz, campaign.windowStart) }
          : { status: "done", lastOutcome: outcome, nextAttemptAt: null }
      )
      .where(eq(campaignContacts.id, cc.id));
  }
  if (outcome === "demo-booked") await closeOutQueue(contact.id, outcome);

  if (campaign.emailsEnabled && owner && updated.email && !updated.emailOptOut) {
    const org = await getOrgSettings();
    const templates = withDefaults(campaign.emailTemplates);
    const now = new Date();
    if (outcome === "demo-booked" && owner.bookingUrl) {
      await enqueueEmail({
        ownerId: owner.id,
        contact: updated,
        campaignId: campaign.id,
        kind: "booking_link",
        dedupeKey: `booking_link:${updated.id}:${campaign.id}`,
        template: templates.booking_link,
        vars: templateVars(updated, owner, org, campaign.id),
        sendAt: now,
        org,
      });
    } else if (outcome === "interested" || outcome === "callback" || (RETRYABLE_OUTCOMES.includes(outcome) && !willRetry)) {
      await enqueueSequence({ prefix: "post_call", steps: templates.post_call, start: now, tz, contact: updated, owner, campaign, org });
    }
    await flushEmails({ contactId: updated.id, limit: 5 });
  }

  await maybeCompleteCampaign(campaign.id);
  return { processed: true, outcome };
}

/** Stops any further calls/cold emails to a contact across campaigns (e.g. once they want or booked a demo). */
export async function closeOutQueue(contactId: string, outcome: string) {
  const future = await db
    .select({ id: calls.id, blandCallId: calls.blandCallId })
    .from(calls)
    .where(and(eq(calls.contactId, contactId), eq(calls.status, "scheduled"), isNull(calls.processedAt),
      gt(calls.scheduledFor, new Date(Date.now() + 60_000))));
  for (const f of future) {
    if (f.blandCallId && !(await stopCall(f.blandCallId))) continue;
    await db.update(calls).set({ status: "cancelled", outcome: "cancelled", processedAt: new Date() }).where(eq(calls.id, f.id));
  }
  const closed = await db
    .update(campaignContacts)
    .set({ status: "done", lastOutcome: outcome, nextAttemptAt: null })
    .where(and(eq(campaignContacts.contactId, contactId), inArray(campaignContacts.status, ["pending", "scheduled"])))
    .returning({ campaignId: campaignContacts.campaignId });
  for (const c of closed) await maybeCompleteCampaign(c.campaignId);
}

export async function maybeCompleteCampaign(campaignId: string) {
  const [{ open }] = await db
    .select({ open: sql<number>`count(*)::int` })
    .from(campaignContacts)
    .where(and(eq(campaignContacts.campaignId, campaignId), inArray(campaignContacts.status, ["pending", "scheduled"])));
  if (open > 0) return;
  const [{ inflight }] = await db
    .select({ inflight: sql<number>`count(*)::int` })
    .from(calls)
    .where(and(eq(calls.campaignId, campaignId), eq(calls.status, "scheduled")));
  if (inflight > 0) return;
  await db.update(campaigns).set({ status: "completed" }).where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "active")));
}

export type BookingInput = {
  ownerId: string;
  provider: "calcom" | "calendly" | "manual";
  externalId: string;
  startAt: Date;
  endAt: Date;
  timezone?: string | null;
  email?: string | null;
  name?: string | null;
  contactIdHint?: string | null;
  campaignIdHint?: string | null;
};

async function findOrCreateContact(input: BookingInput): Promise<Contact> {
  const email = normalizeEmail(input.email);
  const byId = input.contactIdHint && /^[0-9a-f-]{36}$/i.test(input.contactIdHint)
    ? (await db.select().from(contacts)
        .where(and(eq(contacts.id, input.contactIdHint), eq(contacts.ownerId, input.ownerId))).limit(1))[0]
    : undefined;
  if (byId) return byId;
  if (email) {
    const [byEmail] = await db.select().from(contacts)
      .where(and(eq(contacts.ownerId, input.ownerId), eq(contacts.email, email)))
      .orderBy(desc(contacts.updatedAt)).limit(1);
    if (byEmail) return byEmail;
  }
  const [created] = await db.insert(contacts).values({
    ownerId: input.ownerId,
    clubName: input.name || email || "New booking",
    contactName: input.name || null,
    email,
    source: "booking",
  }).returning();
  return created;
}

/** Records a booked demo and queues reminders + post-demo follow-ups. Safe to call repeatedly. */
export async function handleBookingCreated(input: BookingInput) {
  const contact = await findOrCreateContact(input);
  const [owner] = await db.select().from(users).where(eq(users.id, input.ownerId)).limit(1);
  if (!owner) return null;

  let campaignId = input.campaignIdHint && /^[0-9a-f-]{36}$/i.test(input.campaignIdHint) ? input.campaignIdHint : null;
  if (!campaignId) {
    const [latest] = await db.select({ id: campaignContacts.campaignId }).from(campaignContacts)
      .where(eq(campaignContacts.contactId, contact.id)).orderBy(desc(campaignContacts.createdAt)).limit(1);
    campaignId = latest?.id ?? null;
  }
  const [campaign] = campaignId ? await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1) : [];

  const [booking] = await db
    .insert(bookings)
    .values({
      ownerId: owner.id,
      contactId: contact.id,
      campaignId: campaign?.id ?? null,
      provider: input.provider,
      externalId: input.externalId,
      startAt: input.startAt,
      endAt: input.endAt,
      timezone: input.timezone ?? null,
      inviteeEmail: normalizeEmail(input.email),
      inviteeName: input.name ?? null,
      status: "scheduled",
    })
    .onConflictDoUpdate({
      target: [bookings.provider, bookings.externalId],
      set: { startAt: input.startAt, endAt: input.endAt, status: "scheduled", timezone: input.timezone ?? null },
    })
    .returning();

  const bookedEmail = normalizeEmail(input.email);
  const [updated] = await db
    .update(contacts)
    .set({
      stage: "demo-scheduled",
      needsFollowUp: null,
      email: contact.email ?? bookedEmail,
      contactName: contact.contactName ?? input.name ?? null,
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, contact.id))
    .returning();

  await closeOutQueue(contact.id, "demo-scheduled");
  // They booked, so stop cold and post-call nurture emails.
  await cancelEmails(and(eq(emails.contactId, contact.id), or(like(emails.kind, "post_call_%"), like(emails.kind, "cold_%")))!);
  // A reschedule that reuses the same booking id: drop reminders queued for the old time.
  await cancelEmails(and(eq(emails.bookingId, booking.id), notLike(emails.dedupeKey, `%:${booking.startAt.toISOString()}`))!);

  if (updated.email && !updated.emailOptOut && (campaign?.emailsEnabled ?? true)) {
    const org = await getOrgSettings();
    const templates = campaign ? withDefaults(campaign.emailTemplates) : DEFAULT_TEMPLATES;
    const tz = booking.timezone || campaign?.timezone || contactTimeZone(updated, "America/New_York");
    const when = formatInTz(booking.startAt, tz);
    const vars = templateVars(updated, owner, org, campaign?.id, { demo_date: when.date, demo_time: when.time });
    const now = Date.now();
    const base = { ownerId: owner.id, contact: updated, campaignId: campaign?.id ?? null, bookingId: booking.id, vars, org };
    const start = booking.startAt.getTime();
    const key = (k: string) => `${k}:${booking.id}:${booking.startAt.toISOString()}`;

    if (start - 24 * 3600e3 > now + 5 * 60e3) {
      await enqueueEmail({ ...base, kind: "reminder_24h", dedupeKey: key("reminder_24h"), template: templates.reminder_24h, sendAt: new Date(start - 24 * 3600e3) });
    }
    if (start - 3600e3 > now + 5 * 60e3) {
      await enqueueEmail({ ...base, kind: "reminder_1h", dedupeKey: key("reminder_1h"), template: templates.reminder_1h, sendAt: new Date(start - 3600e3) });
    }
    for (const [i, step] of templates.post_demo.entries()) {
      await enqueueEmail({
        ...base,
        kind: `post_demo_${i + 1}`,
        dedupeKey: key(`post_demo_${i + 1}`),
        template: step,
        sendAt: new Date(booking.endAt.getTime() + step.delay_hours * 3600e3),
      });
    }
    await flushEmails({ contactId: updated.id, limit: 10 });
  }
  return booking;
}

export async function handleBookingCanceled(provider: "calcom" | "calendly" | "manual", externalId: string) {
  const [booking] = await db
    .update(bookings)
    .set({ status: "canceled" })
    .where(and(eq(bookings.provider, provider), eq(bookings.externalId, externalId)))
    .returning();
  if (!booking) return null;
  await cancelEmails(eq(emails.bookingId, booking.id));
  if (booking.contactId) {
    await db.update(contacts)
      .set({ stage: "demo-requested", needsFollowUp: "Canceled their demo — reach out to reschedule.", updatedAt: new Date() })
      .where(and(eq(contacts.id, booking.contactId), eq(contacts.stage, "demo-scheduled")));
  }
  return booking;
}

/** Queues the cold email sequence for one contact of an email-only campaign. */
export async function startColdSequence(campaign: Campaign, contact: Contact, owner: User, org: OrgSettings, start: Date) {
  const tz = contactTimeZone(contact, campaign.timezone);
  const templates = withDefaults(campaign.emailTemplates);
  return enqueueSequence({ prefix: "cold", steps: templates.cold, start, tz, contact, owner, campaign, org });
}
