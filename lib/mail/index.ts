import { and, eq } from "drizzle-orm";
import { db, mailboxes, type Mailbox, type MailProvider } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { google } from "./google";
import { microsoft } from "./microsoft";
import { MailAuthError, type MailProviderApi, type Profile, type TokenSet } from "./types";

export * from "./types";

export const PROVIDERS: Record<MailProvider, MailProviderApi> = { google, microsoft };

export function providerConfigured(p: MailProvider) {
  return p === "google"
    ? Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    : Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

export function isProvider(p: string): p is MailProvider {
  return p === "google" || p === "microsoft";
}

/** Creates or re-activates a mailbox for a user after OAuth. Returns null if another user already owns it. */
export async function upsertMailbox(userId: string, provider: MailProvider, profile: Profile, tokens: TokenSet) {
  const [existing] = await db.select().from(mailboxes)
    .where(and(eq(mailboxes.provider, provider), eq(mailboxes.email, profile.email))).limit(1);
  if (existing && existing.userId !== userId && existing.status !== "disconnected") return null;

  const values = {
    userId,
    provider,
    email: profile.email,
    displayName: profile.name,
    accessTokenEnc: encrypt(tokens.accessToken),
    // Providers sometimes omit the refresh token on re-consent; keep the old one in that case.
    refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : existing?.refreshTokenEnc ?? null,
    tokenExpiresAt: tokens.expiresAt,
    status: "active" as const,
    lastError: null,
  };
  if (existing) {
    const [row] = await db.update(mailboxes).set(values).where(eq(mailboxes.id, existing.id)).returning();
    return row;
  }
  const now = new Date();
  const [row] = await db.insert(mailboxes).values({ ...values, syncCursor: now, sentCursor: now }).returning();
  return row;
}

/** Runs `fn` with a fresh access token, refreshing and persisting tokens as needed. */
export async function withMailbox<T>(mb: Mailbox, fn: (api: MailProviderApi, token: string) => Promise<T>): Promise<T> {
  const api = PROVIDERS[mb.provider];
  let token = decrypt(mb.accessTokenEnc);
  try {
    if (!token || !mb.tokenExpiresAt || mb.tokenExpiresAt.getTime() < Date.now() + 120_000) {
      const refresh = decrypt(mb.refreshTokenEnc);
      if (!refresh) throw new MailAuthError("No refresh token — reconnect this inbox.");
      const t = await api.refresh(refresh);
      token = t.accessToken;
      await db.update(mailboxes).set({
        accessTokenEnc: encrypt(t.accessToken),
        ...(t.refreshToken ? { refreshTokenEnc: encrypt(t.refreshToken) } : {}),
        tokenExpiresAt: t.expiresAt,
      }).where(eq(mailboxes.id, mb.id));
    }
    return await fn(api, token!);
  } catch (e) {
    if (e instanceof MailAuthError) {
      await db.update(mailboxes).set({ status: "error", lastError: e.message }).where(eq(mailboxes.id, mb.id));
    }
    throw e;
  }
}

export async function activeMailboxFor(userId: string, preferredId?: string | null) {
  const rows = await db.select().from(mailboxes).where(and(eq(mailboxes.userId, userId), eq(mailboxes.status, "active")));
  return rows.find((m) => m.id === preferredId) ?? rows[0] ?? null;
}
