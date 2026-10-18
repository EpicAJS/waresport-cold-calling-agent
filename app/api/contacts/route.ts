import { NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, contacts, users } from "@/lib/db";
import { authed, ownedBy } from "@/lib/auth";
import { digitsOnly, normalizeEmail } from "@/lib/automation";
import { inferState } from "@/lib/time";

export const GET = authed(async (_req, _ctx, user) => {
  const rows = await db
    .select({ contact: contacts, ownerName: users.name })
    .from(contacts)
    .innerJoin(users, eq(contacts.ownerId, users.id))
    .where(ownedBy(user, contacts.ownerId))
    .orderBy(desc(contacts.createdAt));
  return NextResponse.json(rows.map((r) => ({ ...r.contact, ownerName: r.ownerName })));
});

type Incoming = {
  clubName?: string; contactName?: string; phone?: string; email?: string | null; website?: string | null;
  address?: string | null; city?: string; state?: string; source?: string; verified?: boolean; notes?: string;
  rating?: number | null; reviews?: number | null;
};

export const POST = authed(async (req, _ctx, user) => {
  const body = await req.json().catch(() => null);
  const list: Incoming[] = Array.isArray(body) ? body : body ? [body] : [];
  const rows = list
    .filter((c) => typeof c.clubName === "string" && c.clubName.trim())
    .map((c) => ({
      ownerId: user.id,
      clubName: c.clubName!.trim().slice(0, 200),
      contactName: c.contactName?.trim() || null,
      phone: digitsOnly(c.phone),
      email: normalizeEmail(c.email),
      website: c.website || null,
      address: c.address || null,
      city: c.city?.trim() ?? "",
      state: inferState({ state: c.state, address: c.address, city: c.city }) ?? (c.state?.trim() ?? ""),
      source: c.source || "manual",
      verified: Boolean(c.verified),
      notes: c.notes ?? "",
      rating: typeof c.rating === "number" ? c.rating : null,
      reviews: typeof c.reviews === "number" ? c.reviews : null,
    }));
  if (rows.length === 0) return NextResponse.json({ error: "No valid contacts (club name is required)." }, { status: 400 });

  const withPhone = rows.filter((r) => r.phone);
  const withoutPhone = rows.filter((r) => !r.phone);
  let saved = 0;

  if (withPhone.length) {
    const res = await db
      .insert(contacts)
      .values(withPhone)
      .onConflictDoUpdate({
        target: [contacts.ownerId, contacts.phone],
        targetWhere: sql`${contacts.phone} <> ''`,
        set: {
          email: sql`coalesce(excluded.email, ${contacts.email})`,
          website: sql`coalesce(excluded.website, ${contacts.website})`,
          address: sql`coalesce(excluded.address, ${contacts.address})`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: contacts.id });
    saved += res.length;
  }

  if (withoutPhone.length) {
    const emails = withoutPhone.map((r) => r.email).filter((e): e is string => Boolean(e));
    const existing = emails.length
      ? new Set((await db.select({ email: contacts.email }).from(contacts)
          .where(and(eq(contacts.ownerId, user.id), inArray(contacts.email, emails)))).map((r) => r.email))
      : new Set<string | null>();
    const fresh = withoutPhone.filter((r) => !r.email || !existing.has(r.email));
    if (fresh.length) saved += (await db.insert(contacts).values(fresh).returning({ id: contacts.id })).length;
  }

  return NextResponse.json({ ok: true, count: saved });
});
