import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, contacts, emails, users } from "@/lib/db";
import { authed, canAccess } from "@/lib/auth";
import { composeToContact } from "@/lib/replies";
import { followUpDraft } from "@/lib/ai";
import { personalizedBookingLink } from "@/lib/booking";
import { getOrgSettings } from "@/lib/settings";

export const maxDuration = 30;

async function loadContact(id: unknown) {
  if (typeof id !== "string") return null;
  const [c] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  return c ?? null;
}

// GET ?contactId= returns a suggested follow-up; POST sends it.
export const GET = authed(async (req, _ctx, user) => {
  const contact = await loadContact(req.nextUrl.searchParams.get("contactId"));
  if (!contact || !canAccess(user, contact.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [owner] = await db.select().from(users).where(eq(users.id, contact.ownerId)).limit(1);
  const [last] = await db.select({ subject: emails.subject }).from(emails).where(eq(emails.contactId, contact.id)).orderBy(desc(emails.sentAt)).limit(1);
  const org = await getOrgSettings();
  const draft = await followUpDraft({
    firstName: contact.contactName?.split(" ")[0] || "there",
    clubName: contact.clubName,
    repName: owner.name,
    companyName: org.companyName,
    bookingLink: personalizedBookingLink(owner.bookingUrl, owner.bookingProvider, contact),
    lastSubject: last?.subject ?? "",
  });
  return NextResponse.json({ ...draft, to: contact.email, clubName: contact.clubName });
});

export const POST = authed(async (req, _ctx, user) => {
  const { contactId, text, subject } = await req.json().catch(() => ({}));
  const contact = await loadContact(contactId);
  if (!contact || !canAccess(user, contact.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "The message is empty." }, { status: 400 });
  try {
    await composeToContact(contact.id, contact.ownerId, text.trim(), typeof subject === "string" ? subject : undefined);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't send." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
});
