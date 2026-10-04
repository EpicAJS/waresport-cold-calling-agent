import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { authed } from "@/lib/auth";
import { createResetLink } from "@/lib/password-reset";
import { sendSimpleEmail } from "@/lib/email";

// Admin generates a reset link for a teammate; it's emailed if email is configured and always shown to the admin.
export const POST = authed(async (_req, { params }) => {
  const [member] = await db.select({ id: users.id, name: users.name, email: users.email, disabled: users.disabled })
    .from(users).where(eq(users.id, params.id)).limit(1);
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (member.disabled) return NextResponse.json({ error: "Enable this account before resetting its password." }, { status: 400 });

  const link = await createResetLink(member.id, 24);
  const sent = await sendSimpleEmail(
    member.email,
    "Set a new password",
    `Hi ${member.name},\n\nYour admin created a link for you to set a new password:\n${link}\n\nThis link expires in 24 hours.`
  );
  return NextResponse.json({ ok: true, link, emailed: sent.ok });
}, { admin: true });
