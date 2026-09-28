import { cache } from "react";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { and, eq, gt, SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, sessions, users, type User } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";

export const SESSION_COOKIE = "ws_session";
const SESSION_DAYS = 30;

export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 8) return "Password must be at least 8 characters.";
  return null;
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  cookies().delete(SESSION_COOKIE);
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date()), eq(users.disabled, false)))
    .limit(1);
  return rows[0] ?? null;
});

type Ctx = { params: Record<string, string> };
type Handler = (req: NextRequest, ctx: Ctx, user: SessionUser) => Promise<Response>;

/** Wraps a route handler so it only runs for a signed-in user (optionally admin-only). */
export function authed(handler: Handler, opts: { admin?: boolean } = {}) {
  return async (req: NextRequest, ctx: Ctx) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    if (opts.admin && user.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
    return handler(req, ctx, user);
  };
}

/** Reps see only their own rows; admins see everything. */
export function ownedBy(user: SessionUser, column: PgColumn): SQL | undefined {
  return user.role === "admin" ? undefined : eq(column, user.id);
}

export function canAccess(user: SessionUser, ownerId: string) {
  return user.role === "admin" || user.id === ownerId;
}
