import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, calls } from "@/lib/db";
import { getCall, isCallFinished, type BlandCall } from "@/lib/bland";
import { processCallResult } from "@/lib/automation";
import { safeEqual } from "@/lib/crypto";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (secret && !safeEqual(req.nextUrl.searchParams.get("token") ?? "", secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: BlandCall;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!body.call_id) return NextResponse.json({ ok: true });

  const metadata = body.metadata ?? body.variables?.metadata ?? {};
  const rowId = metadata.call_row_id;
  const [row] = rowId && /^[0-9a-f-]{36}$/i.test(rowId)
    ? await db.select({ id: calls.id, blandCallId: calls.blandCallId }).from(calls).where(eq(calls.id, rowId)).limit(1)
    : await db.select({ id: calls.id, blandCallId: calls.blandCallId }).from(calls).where(eq(calls.blandCallId, body.call_id)).limit(1);
  if (!row) return NextResponse.json({ ok: true, ignored: "unknown call" });
  if (!row.blandCallId) await db.update(calls).set({ blandCallId: body.call_id }).where(eq(calls.id, row.id));

  // The webhook payload can arrive before post-call analysis is attached; prefer the full record.
  let call = body;
  if (!body.analysis || !Object.keys(body.analysis).length) {
    call = await getCall(body.call_id).catch(() => body);
  }
  if (!isCallFinished(call)) return NextResponse.json({ ok: true, pending: true });

  const result = await processCallResult(row.id, call);
  return NextResponse.json({ ok: true, ...result });
}
