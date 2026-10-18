import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { randomToken, sign } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { PROVIDERS, isProvider, providerConfigured } from "@/lib/mail";

const OAUTH_COOKIE = "ws_oauth";

// mode=login signs in (and connects that inbox); mode=connect adds an inbox to the signed-in user.
export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const provider = params.provider;
  const mode = req.nextUrl.searchParams.get("mode") === "connect" ? "connect" : "login";
  const back = mode === "connect" ? "/settings" : "/login";
  if (!isProvider(provider) || !providerConfigured(provider)) {
    return NextResponse.redirect(new URL(`${back}?error=${encodeURIComponent("That sign-in option isn't configured yet.")}`, appUrl()));
  }

  const user = mode === "connect" ? await getSessionUser() : null;
  if (mode === "connect" && !user) return NextResponse.redirect(new URL("/login", appUrl()));

  const state = randomToken(16);
  const payload = Buffer.from(JSON.stringify({ state, mode, provider, userId: user?.id ?? null })).toString("base64url");
  const value = `${payload}.${sign(payload)}`;

  const redirectUri = `${appUrl()}/api/oauth/${provider}/callback`;
  const res = NextResponse.redirect(PROVIDERS[provider].authUrl(state, redirectUri, user?.email));
  res.cookies.set(OAUTH_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return res;
}
