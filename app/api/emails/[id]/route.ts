import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, emails } from "@/lib/db";
import { authed, canAccess } from "@/lib/auth";
import { cancelEmails } from "@/lib/email";

export const DELETE = authed(async (_req, { params }, user) => {
  const [email] = await db.select().from(emails).where(eq(emails.id, params.id)).limit(1);
  if (!email || !canAccess(user, email.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const cancelled = await cancelEmails(eq(emails.id, email.id));
  if (!cancelled) return NextResponse.json({ error: "This email has already gone out and can't be cancelled." }, { status: 409 });
  return NextResponse.json({ ok: true });
});
