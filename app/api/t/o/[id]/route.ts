import { NextRequest } from "next/server";
import { recordEmailEvent } from "@/lib/track-events";

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await recordEmailEvent(params.id, "open").catch(() => null);
  return new Response(PIXEL, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
  });
}
