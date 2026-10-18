import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { runScheduledWork } from "@/lib/dispatcher";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Called by Vercel Cron (daily on Hobby) or any external scheduler, e.g. every 5 minutes on your own server:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/dispatch
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runScheduledWork(50_000);
  return NextResponse.json({ ok: true, ...result });
}
