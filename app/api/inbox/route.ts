import { NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, campaigns, contacts, inboundMessages, mailboxes, users } from "@/lib/db";
import { inboxSelect } from "@/lib/inbox";
import { authed, ownedBy } from "@/lib/auth";

export const GET = authed(async (req, _ctx, user) => {
  const status = req.nextUrl.searchParams.get("status") ?? "new";
  const intent = req.nextUrl.searchParams.get("intent");
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const rows = await db
    .select(inboxSelect)
    .from(inboundMessages)
    .innerJoin(users, eq(inboundMessages.ownerId, users.id))
    .innerJoin(mailboxes, eq(inboundMessages.mailboxId, mailboxes.id))
    .leftJoin(contacts, eq(inboundMessages.contactId, contacts.id))
    .leftJoin(campaigns, eq(inboundMessages.campaignId, campaigns.id))
    .where(and(
      ownedBy(user, inboundMessages.ownerId),
      status === "all" ? undefined : eq(inboundMessages.status, status as "new"),
      intent ? eq(inboundMessages.intent, intent as "positive") : sql`coalesce(${inboundMessages.intent}, 'other') <> 'bounce'`,
      q ? or(ilike(inboundMessages.fromEmail, `%${q}%`), ilike(inboundMessages.fromName, `%${q}%`), ilike(contacts.clubName, `%${q}%`), ilike(inboundMessages.subject, `%${q}%`)) : undefined,
    ))
    .orderBy(desc(inboundMessages.receivedAt))
    .limit(300);
  return NextResponse.json(rows);
});
