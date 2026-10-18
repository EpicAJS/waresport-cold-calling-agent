import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { clickSignature } from "@/lib/tracking";
import { recordEmailEvent } from "@/lib/track-events";

// Signed so it can't be used as an open redirect.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const url = req.nextUrl.searchParams.get("u") ?? "";
  const s = req.nextUrl.searchParams.get("s") ?? "";
  if (!/^https?:\/\//i.test(url) || !safeEqual(s, clickSignature(params.id, url))) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }
  await recordEmailEvent(params.id, "click", url).catch(() => null);
  return NextResponse.redirect(url, 302);
}
