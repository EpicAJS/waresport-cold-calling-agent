import { NextResponse } from "next/server";
import { authed } from "@/lib/auth";
import { sendSimpleEmail } from "@/lib/email";

export const POST = authed(async (req, _ctx, user) => {
  const { to } = await req.json().catch(() => ({}));
  const res = await sendSimpleEmail(
    typeof to === "string" && to.includes("@") ? to : user.email,
    "Email test ✓",
    "Your email settings work. Follow-up emails for your campaigns will be sent from this address."
  );
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}, { admin: true });
