import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, invites, users } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { randomToken, verifySignature } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { PROVIDERS, isProvider, upsertMailbox } from "@/lib/mail";

const OAUTH_COOKIE = "ws_oauth";

function fail(path: string, message: string) {
  const res = NextResponse.redirect(new URL(`${path}?error=${encodeURIComponent(message)}`, appUrl()));
  res.cookies.delete(OAUTH_COOKIE);
  return res;
}

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const provider = params.provider;
  const raw = req.cookies.get(OAUTH_COOKIE)?.value ?? "";
  const [payload, sig] = raw.split(".");
  if (!isProvider(provider) || !payload || !sig || !verifySignature(payload, sig)) return fail("/login", "Sign-in expired. Please try again.");
  const st = JSON.parse(Buffer.from(payload, "base64url").toString()) as { state: string; mode: "login" | "connect"; provider: string; userId: string | null };
  const back = st.mode === "connect" ? "/settings" : "/login";

  const err = req.nextUrl.searchParams.get("error");
  if (err) return fail(back, err === "access_denied" ? "Access wasn't granted." : `Sign-in failed: ${err}`);
  if (req.nextUrl.searchParams.get("state") !== st.state || st.provider !== provider) return fail(back, "Sign-in state mismatch. Please try again.");
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return fail(back, "Missing authorization code.");

  const api = PROVIDERS[provider];
  let tokens, profile;
  try {
    tokens = await api.exchangeCode(code, `${appUrl()}/api/oauth/${provider}/callback`);
    profile = await api.profile(tokens.accessToken);
  } catch (e) {
    return fail(back, e instanceof Error ? e.message : "Sign-in failed.");
  }

  let userId = st.userId;
  if (st.mode === "login") {
    const [existing] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
    if (existing?.disabled) return fail("/login", "This account is disabled.");
    if (existing) {
      userId = existing.id;
    } else {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
      const [invite] = await db.select().from(invites)
        .where(and(eq(invites.email, profile.email), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date()))).limit(1);
      if (count > 0 && !invite) {
        return fail("/login", `No account for ${profile.email}. Ask your admin to invite this email.`);
      }
      const [created] = await db.insert(users).values({
        email: profile.email,
        name: profile.name,
        passwordHash: await hashPassword(randomToken()),
        role: count === 0 ? "admin" : invite!.role,
      }).returning({ id: users.id });
      if (invite) await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
      userId = created.id;
    }
  }

  const mailbox = await upsertMailbox(userId!, provider, profile, tokens);
  if (!mailbox) return fail(back, `${profile.email} is already connected by another teammate.`);

  if (st.mode === "login") await createSession(userId!);
  const res = NextResponse.redirect(new URL(st.mode === "connect" ? `/settings?connected=${encodeURIComponent(profile.email)}` : "/dashboard", appUrl()));
  res.cookies.delete(OAUTH_COOKIE);
  return res;
}
