import { NextResponse } from "next/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, campaigns, campaignContacts, contacts, emails, users } from "@/lib/db";
import { authed, canAccess } from "@/lib/auth";
import { parseCampaignFields } from "@/lib/campaign-input";
import { addContacts, campaignStatColumns } from "@/lib/campaigns";
import { cancelFutureCalls, dispatchCampaign } from "@/lib/dispatcher";
import { cancelEmails } from "@/lib/email";

async function load(id: string) {
  const [row] = await db
    .select({ campaign: campaigns, ownerName: users.name, ...campaignStatColumns })
    .from(campaigns)
    .innerJoin(users, eq(campaigns.ownerId, users.id))
    .where(eq(campaigns.id, id))
    .limit(1);
  if (!row) return null;
  const { campaign, ...rest } = row;
  return { ...campaign, ...rest };
}

export const GET = authed(async (_req, { params }, user) => {
  const campaign = await load(params.id);
  if (!campaign || !canAccess(user, campaign.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const members = await db
    .select({ cc: campaignContacts, contact: contacts })
    .from(campaignContacts)
    .innerJoin(contacts, eq(campaignContacts.contactId, contacts.id))
    .where(eq(campaignContacts.campaignId, campaign.id))
    .orderBy(asc(campaignContacts.createdAt));
  const steps = (await db.execute(sql`
    select e.kind,
      count(*) filter (where e.status in ('sent','scheduled'))::int as sent,
      count(*) filter (where e.status = 'pending')::int as queued,
      count(*) filter (where e.open_count > 0)::int as opened,
      count(*) filter (where e.replied_at is not null)::int as replied,
      count(*) filter (where e.bounced_at is not null)::int as bounced
    from emails e where e.campaign_id = ${campaign.id}
    group by e.kind`)) as unknown as Array<{ kind: string; sent: number; queued: number; opened: number; replied: number; bounced: number }>;
  return NextResponse.json({
    ...campaign,
    steps,
    contacts: members.map(({ cc, contact }) => ({
      ...contact,
      queueStatus: cc.status,
      attempts: cc.attempts,
      nextAttemptAt: cc.nextAttemptAt,
      lastOutcome: cc.lastOutcome,
    })),
  });
});

export const PATCH = authed(async (req, { params }, user) => {
  const campaign = await load(params.id);
  if (!campaign || !canAccess(user, campaign.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const result: Record<string, unknown> = { ok: true };

  const { fields, errors } = parseCampaignFields(body);
  delete fields.channel; // channel is fixed after creation
  if (errors.length) return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  if (Object.keys(fields).length) await db.update(campaigns).set(fields).where(eq(campaigns.id, campaign.id));

  if (Array.isArray(body.contactIds)) {
    result.added = await addContacts(campaign.id, campaign.ownerId, body.contactIds);
    if (campaign.status === "completed") await db.update(campaigns).set({ status: "active" }).where(eq(campaigns.id, campaign.id));
  }
  if (Array.isArray(body.removeContactIds) && body.removeContactIds.length) {
    await db.delete(campaignContacts).where(and(
      eq(campaignContacts.campaignId, campaign.id),
      inArray(campaignContacts.contactId, body.removeContactIds),
      inArray(campaignContacts.status, ["pending", "skipped"]),
    ));
  }

  if (body.status === "paused" && campaign.status === "active") {
    await db.update(campaigns).set({ status: "paused" }).where(eq(campaigns.id, campaign.id));
    result.cancelled = await cancelFutureCalls(campaign.id);
  } else if (body.status === "active" && campaign.status === "paused") {
    await db.update(campaigns).set({ status: "active" }).where(eq(campaigns.id, campaign.id));
    result.dispatched = await dispatchCampaign(campaign.id);
  }
  return NextResponse.json(result);
});

export const DELETE = authed(async (_req, { params }, user) => {
  const campaign = await load(params.id);
  if (!campaign || !canAccess(user, campaign.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await cancelFutureCalls(campaign.id);
  await cancelEmails(eq(emails.campaignId, campaign.id));
  await db.delete(campaigns).where(eq(campaigns.id, campaign.id));
  return NextResponse.json({ ok: true });
});
