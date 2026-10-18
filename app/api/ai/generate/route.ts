import { NextResponse } from "next/server";
import { authed } from "@/lib/auth";
import { chat } from "@/lib/openai";
import { getOrgSettings } from "@/lib/settings";
import { TEMPLATE_VARIABLES } from "@/lib/templates";

export const maxDuration = 60;

const SCRIPT_SYSTEM = `You write call scripts for an AI voice agent that makes outbound B2B cold calls for {{company}}.
The script is given to the voice agent as its instructions. Write it in second person ("You are..."), plain text, no markdown headings.
Include: who the agent is and who it represents, a short natural opener, a one-sentence value proposition, 1–2 discovery questions,
how to handle common objections (busy, not interested, already have a tool, send info), and the goal: get agreement to a short demo.
When they agree, the agent says it will email a link to pick a time (it never books a specific time itself).
Keep it conversational and concise (under 350 words). Be honest that the caller is an AI assistant if asked. Output only the script.`;

const EMAIL_SYSTEM = `You write short, plain-text B2B sales emails for {{company}}.
Return JSON: {"steps":[{"subject":"...","body":"..."}]} with exactly {{count}} emails forming a sequence.
Available placeholders (use them literally with double braces): ${TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(", ")}.
Every email must include {{booking_link}} and be signed by {{rep_name}}. Under 120 words each, no markdown, no emojis.`;

export const POST = authed(async (req) => {
  const body = await req.json().catch(() => ({}));
  const brief = typeof body.brief === "string" ? body.brief.slice(0, 4000) : "";
  const current = typeof body.current === "string" ? body.current.slice(0, 8000) : "";
  if (!brief && !current) return NextResponse.json({ error: "Describe the campaign or provide text to improve." }, { status: 400 });
  const org = await getOrgSettings();

  try {
    if (body.kind === "emails") {
      const count = Math.min(Math.max(Number(body.count) || 3, 1), 6);
      const out = await chat(
        EMAIL_SYSTEM.replace("{{company}}", org.companyName).replace("{{count}}", String(count)),
        `Campaign brief: ${brief || "(none)"}\n${current ? `Improve these existing emails:\n${current}` : ""}`,
        true
      );
      const parsed = JSON.parse(out);
      const steps = Array.isArray(parsed.steps)
        ? parsed.steps.filter((s: any) => typeof s?.subject === "string" && typeof s?.body === "string").slice(0, count)
        : [];
      if (!steps.length) throw new Error("The AI response was empty. Try again.");
      return NextResponse.json({ steps });
    }

    const script = await chat(
      SCRIPT_SYSTEM.replace("{{company}}", org.companyName),
      `Campaign brief: ${brief || "(none)"}\n${current ? `Improve this existing script, keeping what works:\n${current}` : ""}`
    );
    return NextResponse.json({ script: script.trim() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 502 });
  }
});
