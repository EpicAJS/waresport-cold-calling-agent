import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, inboundMessages } from "@/lib/db";
import { authed, canAccess } from "@/lib/auth";
import { sendReply } from "@/lib/replies";

export const maxDuration = 30;

export const POST = authed(async (req, { params }, user) => {
  const [msg] = await db.select({ ownerId: inboundMessages.ownerId }).from(inboundMessages).where(eq(inboundMessages.id, params.id)).limit(1);
  if (!msg || !canAccess(user, msg.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { text } = await req.json().catch(() => ({}));
  if (typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "The reply is empty." }, { status: 400 });
  try {
    await sendReply(params.id, text.trim());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't send the reply." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
});
