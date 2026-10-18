import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, contacts, emails } from "@/lib/db";
import { verifySignature } from "@/lib/crypto";
import { cancelEmails } from "@/lib/email";

// Handles both RFC 8058 one-click unsubscribes from mail clients and the form on /unsubscribe.
export async function POST(req: NextRequest) {
  const c = req.nextUrl.searchParams.get("c") ?? "";
  const s = req.nextUrl.searchParams.get("s") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(c) || !verifySignature(c, s)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }
  await db.update(contacts).set({ emailOptOut: true, updatedAt: new Date() }).where(eq(contacts.id, c));
  await cancelEmails(eq(emails.contactId, c));

  if (req.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
    const body = await req.text();
    if (!body.includes("List-Unsubscribe=One-Click")) {
      return NextResponse.redirect(new URL(`/unsubscribe?c=${c}&s=${s}&done=1`, req.url), 303);
    }
  }
  return NextResponse.json({ ok: true });
}
