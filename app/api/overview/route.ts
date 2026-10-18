import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, campaigns, contacts, inboundMessages, mailboxes, users } from "@/lib/db";
import { authed, ownedBy } from "@/lib/auth";
import { inboxSelect } from "@/lib/inbox";
import {
  campaignTable, dedupShield, funnel, hotLeads, pipeline, repActivity, statCards, subjectLines, today, type Scope,
} from "@/lib/metrics";

export const GET = authed(async (req, _ctx, user) => {
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days")) || 7, 1), 365);
  const scope: Scope = { user };

  const [cards, todayStats, campaignsRows, subjects, funnelRow, reps, leads, deals, dedup] = await Promise.all([
    statCards(scope, days),
    today(scope),
    campaignTable(scope),
    subjectLines(scope, days, 4),
    funnel(scope, days),
    repActivity(scope, days),
    hotLeads(scope),
    pipeline(scope),
    dedupShield(scope, days),
  ]);

  const monitor = await db
    .select(inboxSelect)
    .from(inboundMessages)
    .innerJoin(users, eq(inboundMessages.ownerId, users.id))
    .innerJoin(mailboxes, eq(inboundMessages.mailboxId, mailboxes.id))
    .leftJoin(contacts, eq(inboundMessages.contactId, contacts.id))
    .leftJoin(campaigns, eq(inboundMessages.campaignId, campaigns.id))
    .where(and(ownedBy(user, inboundMessages.ownerId), sql`coalesce(${inboundMessages.intent}, 'other') not in ('bounce')`))
    .orderBy(desc(inboundMessages.receivedAt))
    .limit(6);

  return NextResponse.json({
    days,
    cards,
    today: todayStats,
    campaigns: campaignsRows,
    subjects,
    funnel: funnelRow,
    reps,
    monitor,
    hotLeads: leads,
    pipeline: deals,
    dedup,
  });
});
