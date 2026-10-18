import { NextResponse } from "next/server";
import { authed } from "@/lib/auth";
import { syncMailboxes } from "@/lib/inbox-sync";
import { flushEmails } from "@/lib/email";
import { wakeSnoozed } from "@/lib/background";

export const maxDuration = 60;

// Called about once a minute by open browser tabs so replies show up quickly without a frequent cron.
// Admins' tabs keep the whole team's inboxes fresh; reps' tabs refresh their own.
export const POST = authed(async (_req, _ctx, user) => {
  const deadline = Date.now() + 25_000;
  const sync = await syncMailboxes({ userId: user.role === "admin" ? undefined : user.id, staleMs: 50_000, deadline });
  const sent = await flushEmails({ deadline: Date.now() + 15_000, limit: 25 });
  const woke = await wakeSnoozed();
  return NextResponse.json({ ok: true, sync, sent, woke });
});
