import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, emails, contacts, campaigns, users } from "@/lib/db";
import { authed, ownedBy } from "@/lib/auth";

export const GET = authed(async (req, _ctx, user) => {
  const campaignId = req.nextUrl.searchParams.get("campaign_id");
  const rows = await db
    .select({
      id: emails.id,
      kind: emails.kind,
      toEmail: emails.toEmail,
      subject: emails.subject,
      text: emails.text,
      sendAt: emails.sendAt,
      status: emails.status,
      error: emails.error,
      sentAt: emails.sentAt,
      openCount: emails.openCount,
      clickCount: emails.clickCount,
      repliedAt: emails.repliedAt,
      bouncedAt: emails.bouncedAt,
      contactId: emails.contactId,
      clubName: contacts.clubName,
      campaignId: emails.campaignId,
      campaignName: campaigns.name,
      ownerName: users.name,
    })
    .from(emails)
    .innerJoin(contacts, eq(emails.contactId, contacts.id))
    .innerJoin(users, eq(emails.ownerId, users.id))
    .leftJoin(campaigns, eq(emails.campaignId, campaigns.id))
    .where(and(ownedBy(user, emails.ownerId), campaignId ? eq(emails.campaignId, campaignId) : undefined))
    .orderBy(desc(emails.sendAt))
    .limit(1000);
  return NextResponse.json(rows);
});
