import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, contacts, emails } from "@/lib/db";
import { authed, canAccess } from "@/lib/auth";
import { digitsOnly, normalizeEmail } from "@/lib/automation";
import { cancelEmails } from "@/lib/email";

async function load(id: string) {
  const [c] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  return c ?? null;
}

export const PATCH = authed(async (req, { params }, user) => {
  const contact = await load(params.id);
  if (!contact || !canAccess(user, contact.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  const patch: Partial<typeof contacts.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.clubName === "string" && body.clubName.trim()) patch.clubName = body.clubName.trim();
  if (typeof body.contactName === "string") patch.contactName = body.contactName.trim() || null;
  if (typeof body.phone === "string") patch.phone = digitsOnly(body.phone);
  if (typeof body.email === "string") patch.email = normalizeEmail(body.email);
  if (typeof body.city === "string") patch.city = body.city.trim();
  if (typeof body.state === "string") patch.state = body.state.trim();
  if (typeof body.notes === "string") patch.notes = body.notes;
  if (typeof body.stage === "string") patch.stage = body.stage;
  if (body.clearFollowUp) patch.needsFollowUp = null;
  if (typeof body.emailOptOut === "boolean") patch.emailOptOut = body.emailOptOut;

  const [updated] = await db.update(contacts).set(patch).where(eq(contacts.id, contact.id)).returning();
  if (body.stopEmails || body.emailOptOut === true) {
    await cancelEmails(eq(emails.contactId, contact.id));
  }
  return NextResponse.json(updated);
});

export const DELETE = authed(async (_req, { params }, user) => {
  const contact = await load(params.id);
  if (!contact || !canAccess(user, contact.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await cancelEmails(eq(emails.contactId, contact.id));
  await db.delete(contacts).where(eq(contacts.id, contact.id));
  return NextResponse.json({ ok: true });
});
