import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, mailboxes, users } from "@/lib/db";
import { authed, ownedBy } from "@/lib/auth";
import { providerConfigured } from "@/lib/mail";

export const GET = authed(async (req, _ctx, user) => {
  const mine = req.nextUrl.searchParams.get("mine") === "1";
  const rows = await db
    .select({
      id: mailboxes.id,
      provider: mailboxes.provider,
      email: mailboxes.email,
      status: mailboxes.status,
      lastError: mailboxes.lastError,
      lastSyncAt: mailboxes.lastSyncAt,
      createdAt: mailboxes.createdAt,
      userId: mailboxes.userId,
      ownerName: users.name,
    })
    .from(mailboxes)
    .innerJoin(users, eq(mailboxes.userId, users.id))
    .where(mine ? eq(mailboxes.userId, user.id) : ownedBy(user, mailboxes.userId))
    .orderBy(asc(mailboxes.createdAt));
  return NextResponse.json({
    mailboxes: rows,
    providers: { google: providerConfigured("google"), microsoft: providerConfigured("microsoft") },
  });
});
