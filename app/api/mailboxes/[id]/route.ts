import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, mailboxes } from "@/lib/db";
import { authed, canAccess } from "@/lib/auth";

// Disconnects an inbox: tokens are wiped, history (sent emails, replies) is kept.
export const DELETE = authed(async (_req, { params }, user) => {
  const [mb] = await db.select().from(mailboxes).where(eq(mailboxes.id, params.id)).limit(1);
  if (!mb || !canAccess(user, mb.userId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.update(mailboxes)
    .set({ status: "disconnected", accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null })
    .where(eq(mailboxes.id, mb.id));
  return NextResponse.json({ ok: true });
});
