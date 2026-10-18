import { NextResponse } from "next/server";
import { authed } from "@/lib/auth";
import { syncStaleCalls } from "@/lib/dispatcher";
import { flushEmails } from "@/lib/email";

export const maxDuration = 60;

// Pulls results from Bland for calls whose webhook hasn't arrived. Each call is processed once.
export const POST = authed(async (req, _ctx, user) => {
  const campaignId = req.nextUrl.searchParams.get("campaign_id") ?? undefined;
  const deadline = Date.now() + 45_000;
  const synced = await syncStaleCalls({ campaignId, ownerId: user.role === "admin" ? undefined : user.id, deadline });
  const emails = await flushEmails({ deadline, limit: 50 });
  return NextResponse.json({ synced, emails });
});
