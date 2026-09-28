import type { CampaignChannel, EmailTemplates } from "@/lib/db/schema";
import { isValidTimeZone } from "@/lib/time";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function validTemplate(t: unknown): t is { subject: string; body: string } {
  return !!t && typeof (t as any).subject === "string" && typeof (t as any).body === "string";
}

function validSteps(v: unknown, delayKey: "delay_days" | "delay_hours") {
  return Array.isArray(v) && v.length <= 10 && v.every((s) => validTemplate(s) && Number.isFinite((s as any)[delayKey]) && (s as any)[delayKey] >= 0);
}

export function validateTemplates(v: unknown): v is EmailTemplates {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return validTemplate(t.booking_link) && validTemplate(t.reminder_24h) && validTemplate(t.reminder_1h)
    && validSteps(t.post_demo, "delay_hours") && validSteps(t.post_call, "delay_days") && validSteps(t.cold, "delay_days");
}

/** Picks and validates editable campaign fields from a request body. */
export function parseCampaignFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const errors: string[] = [];
  const str = (k: string, max = 20000) => typeof body[k] === "string" ? (body[k] as string).slice(0, max) : undefined;

  if (body.name !== undefined) { const v = str("name", 200)?.trim(); if (v) out.name = v; else errors.push("Name is required."); }
  if (body.description !== undefined) out.description = str("description", 2000) ?? "";
  if (body.channel !== undefined) {
    if (body.channel === "call" || body.channel === "email") out.channel = body.channel as CampaignChannel;
    else errors.push("Channel must be 'call' or 'email'.");
  }
  if (body.script !== undefined) out.script = str("script") ?? "";
  if (body.voiceId !== undefined) out.voiceId = str("voiceId", 100) ?? "";
  if (body.fromNumber !== undefined) out.fromNumber = str("fromNumber", 30) || null;
  if (body.maxPerDay !== undefined) {
    const n = Number(body.maxPerDay);
    if (Number.isInteger(n) && n >= 1 && n <= 1000) out.maxPerDay = n; else errors.push("Daily limit must be 1–1000.");
  }
  if (body.maxRetries !== undefined) {
    const n = Number(body.maxRetries);
    if (Number.isInteger(n) && n >= 0 && n <= 5) out.maxRetries = n; else errors.push("Retries must be 0–5.");
  }
  for (const k of ["windowStart", "windowEnd"] as const) {
    if (body[k] !== undefined) { if (HHMM.test(String(body[k]))) out[k] = body[k]; else errors.push("Times must be HH:MM."); }
  }
  if (out.windowStart && out.windowEnd && String(out.windowStart) >= String(out.windowEnd)) errors.push("End time must be after start time.");
  if (body.timezone !== undefined) { if (isValidTimeZone(String(body.timezone))) out.timezone = body.timezone; else errors.push("Invalid timezone."); }
  if (body.emailsEnabled !== undefined) out.emailsEnabled = Boolean(body.emailsEnabled);
  if (body.emailTemplates !== undefined) {
    if (validateTemplates(body.emailTemplates)) out.emailTemplates = body.emailTemplates; else errors.push("Email templates are invalid.");
  }
  return { fields: out, errors };
}
