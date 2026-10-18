import { NextResponse } from "next/server";
import { authed } from "@/lib/auth";
import {
  callSummary, campaignTable, dailySeries, funnel, intentBreakdown, pipeline, repActivity, statCards, subjectLines, type Scope,
} from "@/lib/metrics";

// Team-wide analytics for admins; ?user= narrows to one rep.
export const GET = authed(async (req, _ctx, user) => {
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days")) || 30, 1), 365);
  const onlyUserId = req.nextUrl.searchParams.get("user");
  const scope: Scope = { user, onlyUserId: onlyUserId && /^[0-9a-f-]{36}$/i.test(onlyUserId) ? onlyUserId : null };

  const [cards, subjects, funnelRow, reps, series, intents, calls, campaignsRows, deals] = await Promise.all([
    statCards(scope, days),
    subjectLines(scope, days, 50),
    funnel(scope, days),
    repActivity({ user }, days),
    dailySeries(scope, days),
    intentBreakdown(scope, days),
    callSummary(scope, days),
    campaignTable(scope, { statuses: ["active", "paused", "completed"], limit: 50 }),
    pipeline(scope),
  ]);
  return NextResponse.json({ days, cards, subjects, funnel: funnelRow, reps, series, intents, calls, campaigns: campaignsRows, pipeline: deals });
}, { admin: true });
