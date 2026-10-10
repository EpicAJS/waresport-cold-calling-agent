import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, deals } from "@/lib/db";
import { authed, canAccess } from "@/lib/auth";
import { DEAL_STAGES } from "@/lib/deal-stages";

export const PATCH = authed(async (req, { params }, user) => {
  const [deal] = await db.select().from(deals).where(eq(deals.id, params.id)).limit(1);
  if (!deal || !canAccess(user, deal.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const patch: Partial<typeof deals.$inferInsert> = {};
  if (DEAL_STAGES.includes(body.stage) && body.stage !== deal.stage) {
    patch.stage = body.stage;
    patch.stageChangedAt = new Date();
  }
  if (body.amount !== undefined) {
    if (body.amount === null || body.amount === "") patch.amount = null;
    else if (Number.isFinite(Number(body.amount)) && Number(body.amount) >= 0) patch.amount = Math.round(Number(body.amount));
    else return NextResponse.json({ error: "Amount must be a number." }, { status: 400 });
  }
  if (typeof body.recurring === "boolean") patch.recurring = body.recurring;
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 4000);
  if (Object.keys(patch).length) await db.update(deals).set(patch).where(eq(deals.id, deal.id));
  return NextResponse.json({ ok: true });
});

export const DELETE = authed(async (_req, { params }, user) => {
  const [deal] = await db.select().from(deals).where(eq(deals.id, params.id)).limit(1);
  if (!deal || !canAccess(user, deal.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(deals).where(eq(deals.id, deal.id));
  return NextResponse.json({ ok: true });
});
