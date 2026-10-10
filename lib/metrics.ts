import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

type Row = Record<string, unknown>;

async function rows<T = Row>(q: SQL): Promise<T[]> {
  return (await db.execute(q)) as unknown as T[];
}

/** Reps see their own numbers; admins see the team (or one rep when `onlyUserId` is given). */
export type Scope = { user: SessionUser; onlyUserId?: string | null };

function own(scope: Scope, column: string) {
  const col = sql.raw(column);
  if (scope.user.role !== "admin") return sql`${col} = ${scope.user.id}`;
  if (scope.onlyUserId) return sql`${col} = ${scope.onlyUserId}`;
  return sql`true`;
}

const OUTREACH = sql.raw(`(e.kind like 'cold\\_%' or e.kind like 'post\\_call\\_%' or e.kind in ('manual','followup','booking_link'))`);
const HUMAN_REPLY = sql.raw(`coalesce(i.intent,'other') not in ('bounce','out-of-office')`);

/** ISO string (not a Date) so it can go straight into raw SQL as a timestamptz. */
export function rangeStart(days: number) {
  return new Date(Date.now() - days * 24 * 3600e3).toISOString();
}

export async function statCards(scope: Scope, days: number) {
  const since = rangeStart(days);
  const prev = rangeStart(days * 2);
  const [r] = await rows<{ positive: number; positive_prev: number; negative: number; not_interested: number; needs_info: number }>(sql`
    select
      count(*) filter (where i.intent = 'positive' and i.received_at >= ${since})::int as positive,
      count(*) filter (where i.intent = 'positive' and i.received_at < ${since})::int as positive_prev,
      count(*) filter (where i.intent = 'negative' and i.received_at >= ${since})::int as negative,
      count(*) filter (where i.intent = 'not-interested' and i.received_at >= ${since})::int as not_interested,
      count(*) filter (where i.intent = 'needs-info' and i.received_at >= ${since})::int as needs_info
    from inbound_messages i
    where i.received_at >= ${prev} and ${own(scope, "i.owner_id")}`);
  const [e] = await rows<{ bounced: number; no_response: number; emailed: number }>(sql`
    select
      count(distinct e.contact_id) filter (where e.bounced_at is not null)::int as bounced,
      count(distinct e.contact_id) filter (where e.bounced_at is null and not exists (
        select 1 from inbound_messages i where i.contact_id = e.contact_id and ${HUMAN_REPLY}))::int as no_response,
      count(distinct e.contact_id)::int as emailed
    from emails e
    where e.status in ('sent','scheduled') and e.sent_at >= ${since} and ${OUTREACH} and ${own(scope, "e.owner_id")}`);
  const [c] = await rows<{ active: number }>(sql`
    select count(*)::int as active from campaigns c where c.status = 'active' and ${own(scope, "c.owner_id")}`);
  return {
    positive: r.positive,
    positiveDelta: r.positive - r.positive_prev,
    negative: r.negative + r.not_interested,
    negativeHard: r.negative,
    notInterested: r.not_interested,
    needsInfo: r.needs_info,
    bounced: e.bounced,
    noResponse: e.no_response,
    emailed: e.emailed,
    activeCampaigns: c.active,
  };
}

export async function today(scope: Scope) {
  const [r] = await rows<{ positive: number; declined: number; waiting: number }>(sql`
    select
      count(*) filter (where i.intent = 'positive' and i.received_at >= date_trunc('day', now()))::int as positive,
      count(*) filter (where i.intent in ('not-interested','negative') and i.received_at >= date_trunc('day', now()))::int as declined,
      count(*) filter (where i.status = 'new' and ${HUMAN_REPLY})::int as waiting
    from inbound_messages i where ${own(scope, "i.owner_id")}`);
  return r;
}

export async function campaignTable(scope: Scope, opts: { statuses?: string[]; limit?: number } = {}) {
  const statuses = opts.statuses ?? ["active", "paused"];
  return rows<{
    id: string; name: string; channel: string; status: string; owner_name: string; contacts: number;
    emailed: number; opened: number; replied: number; positive: number; sent: number;
    calls: number; answered: number; demos: number;
  }>(sql`
    select c.id, c.name, c.channel, c.status, u.name as owner_name,
      (select count(*) from campaign_contacts cc where cc.campaign_id = c.id)::int as contacts,
      (select count(*) from emails e where e.campaign_id = c.id and e.status in ('sent','scheduled') and e.kind <> 'reply')::int as sent,
      (select count(distinct e.contact_id) from emails e where e.campaign_id = c.id and e.status in ('sent','scheduled') and e.kind <> 'reply')::int as emailed,
      (select count(distinct e.contact_id) from emails e where e.campaign_id = c.id and e.open_count > 0)::int as opened,
      (select count(distinct i.contact_id) from inbound_messages i where i.campaign_id = c.id and ${HUMAN_REPLY})::int as replied,
      (select count(distinct i.contact_id) from inbound_messages i where i.campaign_id = c.id and i.intent = 'positive')::int as positive,
      (select count(*) from calls k where k.campaign_id = c.id and k.status in ('completed','failed'))::int as calls,
      (select count(*) from calls k where k.campaign_id = c.id and k.status = 'completed'
        and coalesce(k.outcome_override, k.outcome) not in ('no-answer','voicemail','failed','pending','cancelled'))::int as answered,
      (select count(*) from calls k where k.campaign_id = c.id and coalesce(k.outcome_override, k.outcome) = 'demo-booked')::int as demos
    from campaigns c join users u on u.id = c.owner_id
    where c.status in ${statuses} and ${own(scope, "c.owner_id")}
    order by (c.status = 'active') desc, c.created_at desc
    limit ${opts.limit ?? 10}`);
}

export async function subjectLines(scope: Scope, days: number, limit = 6) {
  return rows<{ subject: string; sends: number; opened: number; replied: number; bounced: number }>(sql`
    select coalesce(nullif(e.subject_template, ''), e.subject) as subject,
      count(*)::int as sends,
      count(*) filter (where e.open_count > 0)::int as opened,
      count(*) filter (where e.replied_at is not null)::int as replied,
      count(*) filter (where e.bounced_at is not null)::int as bounced
    from emails e
    where e.status in ('sent','scheduled') and e.sent_at >= ${rangeStart(days)} and e.kind <> 'reply' and ${own(scope, "e.owner_id")}
    group by 1
    order by sends desc
    limit ${limit}`);
}

export async function funnel(scope: Scope, days: number) {
  const since = rangeStart(days);
  const [r] = await rows<{ sent: number; bounced: number; opened: number; replied: number; positive: number }>(sql`
    select count(*)::int as sent,
      count(*) filter (where e.bounced_at is not null)::int as bounced,
      count(*) filter (where e.open_count > 0)::int as opened,
      count(*) filter (where e.replied_at is not null)::int as replied,
      count(*) filter (where exists (select 1 from inbound_messages i where i.email_id = e.id and i.intent = 'positive'))::int as positive
    from emails e
    where e.status in ('sent','scheduled') and e.sent_at >= ${since} and ${OUTREACH} and ${own(scope, "e.owner_id")}`);
  return { sent: r.sent, delivered: r.sent - r.bounced, opened: r.opened, replied: r.replied, positive: r.positive };
}

export async function repActivity(scope: Scope, days: number) {
  const since = rangeStart(days);
  return rows<{
    id: string; name: string; email: string; role: string; sent: number; opened: number; replied: number;
    positive: number; negative: number; bounced: number; calls: number; inboxes: number;
  }>(sql`
    select u.id, u.name, u.email, u.role,
      (select count(*) from emails e where e.owner_id = u.id and e.status in ('sent','scheduled') and e.sent_at >= ${since} and e.kind <> 'reply')::int as sent,
      (select count(*) from emails e where e.owner_id = u.id and e.sent_at >= ${since} and e.open_count > 0)::int as opened,
      (select count(*) from inbound_messages i where i.owner_id = u.id and i.received_at >= ${since} and ${HUMAN_REPLY})::int as replied,
      (select count(*) from inbound_messages i where i.owner_id = u.id and i.received_at >= ${since} and i.intent = 'positive')::int as positive,
      (select count(*) from inbound_messages i where i.owner_id = u.id and i.received_at >= ${since} and i.intent in ('negative','not-interested'))::int as negative,
      (select count(*) from emails e where e.owner_id = u.id and e.sent_at >= ${since} and e.bounced_at is not null)::int as bounced,
      (select count(*) from calls k where k.owner_id = u.id and k.scheduled_for >= ${since} and k.status = 'completed')::int as calls,
      (select count(*) from mailboxes m where m.user_id = u.id and m.status = 'active')::int as inboxes
    from users u
    where not u.disabled and ${own(scope, "u.id")}
    order by sent desc, u.name`);
}

export async function hotLeads(scope: Scope, limit = 8) {
  return rows<{
    id: string; club_name: string; contact_name: string | null; phone: string; email: string | null; owner_name: string;
    opens_today: number; opens: number; clicks: number; last_at: string;
  }>(sql`
    select c.id, c.club_name, c.contact_name, c.phone, c.email, u.name as owner_name,
      count(*) filter (where ev.type = 'open' and ev.created_at >= date_trunc('day', now()))::int as opens_today,
      count(*) filter (where ev.type = 'open')::int as opens,
      count(*) filter (where ev.type = 'click')::int as clicks,
      max(ev.created_at) as last_at
    from email_events ev
    join contacts c on c.id = ev.contact_id
    join users u on u.id = c.owner_id
    where ev.created_at >= now() - interval '3 days' and ${own(scope, "c.owner_id")}
      and not c.email_opt_out
      and not exists (select 1 from inbound_messages i where i.contact_id = c.id and i.received_at >= now() - interval '14 days'
        and coalesce(i.intent,'other') not in ('bounce','out-of-office'))
    group by c.id, u.name
    having count(*) filter (where ev.type = 'open') >= 3 or count(*) filter (where ev.type = 'click') >= 1
    order by max(ev.created_at) desc
    limit ${limit}`);
}

export async function pipeline(scope: Scope) {
  const stages = await rows<{ stage: string; n: number; amount: number; recurring: boolean }>(sql`
    select d.stage, count(*)::int as n, coalesce(sum(d.amount), 0)::int as amount, bool_or(d.recurring) as recurring
    from deals d where ${own(scope, "d.owner_id")} group by d.stage`);
  return Object.fromEntries(stages.map((s) => [s.stage, s]));
}

export async function dedupShield(scope: Scope, days: number, limit = 5) {
  const since = rangeStart(days);
  const [{ n }] = await rows<{ n: number }>(sql`
    select count(*)::int as n from dedup_blocks b where b.created_at >= ${since} and ${own(scope, "b.blocked_user_id")}`);
  const recent = await rows<{ id: string; club_name: string; contact_name: string | null; prior_name: string | null; prior_at: string | null; blocked_name: string; channel: string; created_at: string }>(sql`
    select b.id, c.club_name, c.contact_name, pu.name as prior_name, b.prior_contact_at as prior_at, bu.name as blocked_name, b.channel, b.created_at
    from dedup_blocks b
    join contacts c on c.id = b.contact_id
    join users bu on bu.id = b.blocked_user_id
    left join users pu on pu.id = b.prior_user_id
    where ${own(scope, "b.blocked_user_id")}
    order by b.created_at desc limit ${limit}`);
  return { count: n, recent };
}

export async function dailySeries(scope: Scope, days: number) {
  const since = rangeStart(days);
  const sent = await rows<{ day: string; n: number }>(sql`
    select to_char(date_trunc('day', e.sent_at), 'YYYY-MM-DD') as day, count(*)::int as n from emails e
    where e.status in ('sent','scheduled') and e.sent_at >= ${since} and e.kind <> 'reply' and ${own(scope, "e.owner_id")} group by 1`);
  const opened = await rows<{ day: string; n: number }>(sql`
    select to_char(date_trunc('day', e.first_opened_at), 'YYYY-MM-DD') as day, count(*)::int as n from emails e
    where e.first_opened_at >= ${since} and ${own(scope, "e.owner_id")} group by 1`);
  const replied = await rows<{ day: string; n: number; positive: number }>(sql`
    select to_char(date_trunc('day', i.received_at), 'YYYY-MM-DD') as day, count(*)::int as n,
      count(*) filter (where i.intent = 'positive')::int as positive
    from inbound_messages i where i.received_at >= ${since} and ${HUMAN_REPLY} and ${own(scope, "i.owner_id")} group by 1`);
  const out: Array<{ day: string; sent: number; opened: number; replied: number; positive: number }> = [];
  for (let d = new Date(since); d.getTime() <= Date.now(); d = new Date(d.getTime() + 24 * 3600e3)) {
    const day = d.toISOString().slice(0, 10);
    out.push({
      day,
      sent: sent.find((r) => r.day === day)?.n ?? 0,
      opened: opened.find((r) => r.day === day)?.n ?? 0,
      replied: replied.find((r) => r.day === day)?.n ?? 0,
      positive: replied.find((r) => r.day === day)?.positive ?? 0,
    });
  }
  return out;
}

export async function intentBreakdown(scope: Scope, days: number) {
  return rows<{ intent: string; n: number }>(sql`
    select coalesce(i.intent, 'other') as intent, count(*)::int as n from inbound_messages i
    where i.received_at >= ${rangeStart(days)} and ${own(scope, "i.owner_id")} group by 1 order by n desc`);
}

export async function callSummary(scope: Scope, days: number) {
  const [r] = await rows<{ calls: number; answered: number; demos: number }>(sql`
    select count(*)::int as calls,
      count(*) filter (where coalesce(k.outcome_override, k.outcome) not in ('no-answer','voicemail','failed','pending','cancelled'))::int as answered,
      count(*) filter (where coalesce(k.outcome_override, k.outcome) = 'demo-booked')::int as demos
    from calls k where k.status = 'completed' and k.scheduled_for >= ${rangeStart(days)} and ${own(scope, "k.owner_id")}`);
  return r;
}
