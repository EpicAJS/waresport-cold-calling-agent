import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db, phoneNumbers } from "@/lib/db";
import { authed } from "@/lib/auth";
import { toE164 } from "@/lib/dispatcher";

export const GET = authed(async () => {
  return NextResponse.json(await db.select().from(phoneNumbers).orderBy(asc(phoneNumbers.createdAt)));
});

export const POST = authed(async (req) => {
  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const digits = typeof body.number === "string" ? body.number.replace(/\D/g, "") : "";
  if (!label || digits.length < 10) return NextResponse.json({ error: "Label and a valid phone number are required." }, { status: 400 });
  const [pn] = await db.insert(phoneNumbers).values({ label, number: toE164(digits) }).returning();
  return NextResponse.json(pn, { status: 201 });
}, { admin: true });
