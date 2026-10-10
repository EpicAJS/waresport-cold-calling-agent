import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, mailboxes } from "@/lib/db";
import { authed, canAccess } from "@/lib/auth";
import { syncMailbox } from "@/lib/inbox-sync";

export const maxDuration = 60;

export const POST = authed(async (_req, { params }, user) => {
  const [mb] = await db.select().from(mailboxes).where(eq(mailboxes.id, params.id)).limit(1);
  if (!mb || !canAccess(user, mb.userId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (mb.status === "disconnected") return NextResponse.json({ error: "Reconnect this inbox first." }, { status: 400 });
  const stats = await syncMailbox(mb);
  const [after] = await db.select({ lastError: mailboxes.lastError, status: mailboxes.status }).from(mailboxes).where(eq(mailboxes.id, mb.id)).limit(1);
  return NextResponse.json({ ok: !after.lastError, ...stats, error: after.lastError });
});
