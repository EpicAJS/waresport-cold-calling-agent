import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, invites } from "@/lib/db";
import { authed } from "@/lib/auth";

export const DELETE = authed(async (_req, { params }) => {
  await db.delete(invites).where(eq(invites.id, params.id));
  return NextResponse.json({ ok: true });
}, { admin: true });
