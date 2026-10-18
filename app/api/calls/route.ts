import { NextResponse } from "next/server";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db, calls, campaigns, contacts, users } from "@/lib/db";
import { authed, ownedBy } from "@/lib/auth";

export const GET = authed(async (req, _ctx, user) => {
  const campaignId = req.nextUrl.searchParams.get("campaign_id");
  const where = and(
    ownedBy(user, calls.ownerId),
    ne(calls.status, "cancelled"),
    campaignId ? eq(calls.campaignId, campaignId) : undefined,
  );
  const rows = await db
    .select({
      id: calls.id,
      campaignId: calls.campaignId,
      campaignName: campaigns.name,
      contactId: calls.contactId,
      clubName: contacts.clubName,
      phone: contacts.phone,
      email: contacts.email,
      stage: contacts.stage,
      ownerName: users.name,
      attempt: calls.attempt,
      status: calls.status,
      outcome: sql<string>`coalesce(${calls.outcomeOverride}, ${calls.outcome})`,
      duration: calls.durationSec,
      summary: calls.summary,
      transcript: calls.transcript,
      recordingUrl: calls.recordingUrl,
      error: calls.error,
      scheduledFor: calls.scheduledFor,
      endedAt: calls.endedAt,
    })
    .from(calls)
    .innerJoin(contacts, eq(calls.contactId, contacts.id))
    .innerJoin(campaigns, eq(calls.campaignId, campaigns.id))
    .innerJoin(users, eq(calls.ownerId, users.id))
    .where(where)
    .orderBy(desc(calls.scheduledFor))
    .limit(2000);
  return NextResponse.json(rows);
});
