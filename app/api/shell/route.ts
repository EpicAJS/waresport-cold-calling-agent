import { NextResponse } from "next/server";
import { and, asc, eq, max, sql } from "drizzle-orm";
import { db, inboundMessages, mailboxes, users } from "@/lib/db";
import { authed, ownedBy } from "@/lib/auth";

// Lightweight data for the sidebar and top bar: connected inboxes, unread AI inbox count, scan status.
export const GET = authed(async (_req, _ctx, user) => {
  const boxes = await db
    .select({
      id: mailboxes.id,
      email: mailboxes.email,
      provider: mailboxes.provider,
      status: mailboxes.status,
      lastSyncAt: mailboxes.lastSyncAt,
      ownerName: users.name,
    })
    .from(mailboxes)
    .innerJoin(users, eq(mailboxes.userId, users.id))
    .where(and(ownedBy(user, mailboxes.userId), eq(users.disabled, false)))
    .orderBy(asc(mailboxes.createdAt));

  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(inboundMessages)
    .where(and(
      ownedBy(user, inboundMessages.ownerId),
      eq(inboundMessages.status, "new"),
      sql`coalesce(${inboundMessages.intent}, 'other') not in ('bounce','out-of-office')`,
    ));

  const [{ threads }] = await db
    .select({ threads: sql<number>`count(distinct coalesce(thread_id, id::text))::int` })
    .from(sql`emails`)
    .where(sql`status in ('sent','scheduled') ${user.role === "admin" ? sql`` : sql`and owner_id = ${user.id}`}`);

  const [{ lastScan }] = await db.select({ lastScan: max(mailboxes.lastSyncAt) }).from(mailboxes)
    .where(ownedBy(user, mailboxes.userId));

  return NextResponse.json({
    mailboxes: boxes,
    unread,
    threads,
    lastScanAt: lastScan,
    aiEnabled: Boolean(process.env.OPENAI_API_KEY),
  });
});
