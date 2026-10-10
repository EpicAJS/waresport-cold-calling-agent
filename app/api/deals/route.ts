import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, campaigns, contacts, deals, users } from "@/lib/db";
import { authed, canAccess, ownedBy } from "@/lib/auth";
import { DEAL_STAGES } from "@/lib/deal-stages";

export const GET = authed(async (_req, _ctx, user) => {
  const rows = await db
    .select({
      id: deals.id,
      stage: deals.stage,
      amount: deals.amount,
      recurring: deals.recurring,
      source: deals.source,
      notes: deals.notes,
      stageChangedAt: deals.stageChangedAt,
      createdAt: deals.createdAt,
      contactId: deals.contactId,
      clubName: contacts.clubName,
      contactName: contacts.contactName,
      email: contacts.email,
      phone: contacts.phone,
      campaignName: campaigns.name,
      ownerName: users.name,
    })
    .from(deals)
    .innerJoin(contacts, eq(deals.contactId, contacts.id))
    .innerJoin(users, eq(deals.ownerId, users.id))
    .leftJoin(campaigns, eq(deals.campaignId, campaigns.id))
    .where(ownedBy(user, deals.ownerId))
    .orderBy(desc(deals.stageChangedAt))
    .limit(1000);
  return NextResponse.json(rows);
});

export const POST = authed(async (req, _ctx, user) => {
  const { contactId, stage, amount, recurring } = await req.json().catch(() => ({}));
  const [contact] = typeof contactId === "string" ? await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1) : [];
  if (!contact || !canAccess(user, contact.ownerId)) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  const s = DEAL_STAGES.includes(stage) ? stage : "positive";
  const [deal] = await db.insert(deals).values({
    ownerId: contact.ownerId,
    contactId: contact.id,
    stage: s,
    amount: Number.isFinite(Number(amount)) && amount !== null && amount !== "" ? Math.round(Number(amount)) : null,
    recurring: Boolean(recurring),
    source: "manual",
  }).onConflictDoNothing({ target: deals.contactId }).returning();
  if (!deal) return NextResponse.json({ error: "This contact already has a deal." }, { status: 409 });
  return NextResponse.json(deal, { status: 201 });
});
