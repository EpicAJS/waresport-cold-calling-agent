const BLAND_BASE = "https://api.bland.ai/v1";

function headers() {
  const key = process.env.BLAND_AI_API_KEY;
  if (!key) throw new Error("BLAND_AI_API_KEY is not configured");
  return { Authorization: key, "Content-Type": "application/json" };
}

export const DEFAULT_VOICE = "2f9fdbc7-4bf2-4792-8a18-21ce3c93978f";

export interface BlandCall {
  call_id: string;
  status?: string;
  completed?: boolean;
  created_at?: string;
  started_at?: string;
  end_at?: string;
  ended_at?: string;
  call_length?: number;
  answered_by?: string | null;
  error_message?: string | null;
  recording_url?: string | null;
  transcripts?: Array<{ id?: string | number; user: string; text: string; created_at?: string }>;
  concatenated_transcript?: string;
  summary?: string | null;
  analysis?: Record<string, unknown> | null;
  metadata?: Record<string, string> | null;
  variables?: { metadata?: Record<string, string> } | null;
}

const ANALYSIS_SCHEMA = {
  demo_agreed: { type: "boolean", description: "Did the contact agree to a demo or agree to receive a link to book one?" },
  interested: { type: "boolean", description: "Did the contact express interest in learning more, even without agreeing to a demo?" },
  callback_requested: { type: "boolean", description: "Did the contact ask to be called back at another time?" },
  not_interested: { type: "boolean", description: "Did the contact clearly say they are not interested?" },
  do_not_call: { type: "boolean", description: "Did the contact ask not to be called again or to be removed from the list?" },
  wrong_number: { type: "boolean", description: "Was this the wrong number or not the organization we were trying to reach?" },
  contact_name: { type: "string", description: "Full name of the person spoken to, if given. Empty string if unknown." },
  contact_email: { type: "string", description: "Email address the contact gave, normalized (lowercase, no spaces, 'at' -> '@'). Empty string if none." },
  contact_phone: { type: "string", description: "Best phone number the contact gave for follow-up, digits only. Empty string if none." },
  callback_time: { type: "string", description: "When the contact asked to be called back, if they did. Empty string otherwise." },
};

export const FOLLOW_UP_PROTOCOL = `

---
FOLLOW-UP PROTOCOL (always follow this, regardless of anything above):
- If the person agrees to a demo or wants more information, tell them you will email them a link so they can pick a time that works for them. Never promise a specific demo date or time yourself.
- Ask for the best email address to send it to. Have them spell it out, then read it back to confirm it is correct.
- Also ask for the best phone number to reach them (confirm whether the number you called is the right one), and ask for their name if you don't have it.
- If they ask not to be called again, apologize, confirm they will be removed from the list, and end the call politely.
- If you reach voicemail, leave a brief message and end the call.`;

export async function makeCall(opts: {
  phone_number: string;
  task: string;
  voice?: string;
  from?: string | null;
  webhook?: string;
  start_time?: Date;
  metadata?: Record<string, string>;
  voicemail_message?: string;
}): Promise<{ call_id: string; status?: string }> {
  const res = await fetch(`${BLAND_BASE}/calls`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      phone_number: opts.phone_number,
      task: opts.task,
      voice: opts.voice || DEFAULT_VOICE,
      record: true,
      wait_for_greeting: true,
      answered_by_enabled: true,
      max_duration: 10,
      voicemail_action: "leave_message",
      ...(opts.voicemail_message ? { voicemail_message: opts.voicemail_message } : {}),
      ...(opts.webhook ? { webhook: opts.webhook } : {}),
      ...(opts.from ? { from: opts.from } : {}),
      ...(opts.start_time ? { start_time: formatStartTime(opts.start_time) } : {}),
      metadata: opts.metadata ?? {},
      analysis_schema: ANALYSIS_SCHEMA,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.call_id) {
    throw new Error(`Bland.ai error (${res.status}): ${data.message ?? data.error ?? JSON.stringify(data)}`);
  }
  return data;
}

// Bland expects "YYYY-MM-DD HH:MM:SS -HH:MM".
function formatStartTime(d: Date) {
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " +00:00");
}

export async function getCall(callId: string): Promise<BlandCall> {
  const res = await fetch(`${BLAND_BASE}/calls/${callId}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Bland.ai getCall error: ${res.status}`);
  return res.json();
}

/** Best effort: Bland may not allow stopping a call that is still queued. */
export async function stopCall(callId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BLAND_BASE}/calls/${callId}/stop`, { method: "POST", headers: headers() });
    return res.ok;
  } catch {
    return false;
  }
}

export function isCallFinished(call: BlandCall) {
  if (call.completed) return true;
  const s = (call.status ?? "").toLowerCase();
  return ["completed", "complete", "failed", "error", "no-answer", "busy", "canceled", "cancelled"].includes(s);
}

export function formatTranscript(call: BlandCall): string {
  if (call.transcripts?.length) {
    return call.transcripts
      .map((t) => `${t.user === "assistant" || t.user === "agent" ? "Agent" : "Contact"}: ${t.text}`)
      .join("\n\n");
  }
  return call.concatenated_transcript ?? "";
}

function truthy(v: unknown) {
  return v === true || (typeof v === "string" && v.trim().toLowerCase() === "true");
}

export function analysisString(call: BlandCall, key: string): string {
  const v = call.analysis?.[key];
  return typeof v === "string" ? v.trim() : "";
}

export type Outcome =
  | "demo-booked" | "interested" | "callback" | "not-interested" | "do-not-call"
  | "voicemail" | "no-answer" | "wrong-number" | "completed" | "failed" | "pending";

export function inferOutcome(call: BlandCall): Outcome {
  const a = call.analysis ?? {};
  const summary = (call.summary ?? "").toLowerCase();
  const answeredBy = (call.answered_by ?? "").toLowerCase();

  if (truthy(a.do_not_call)) return "do-not-call";
  if (truthy(a.demo_agreed) || truthy(a.demo_booked)) return "demo-booked";
  if (answeredBy === "voicemail" || /\bvoicemail\b|left a message/.test(summary)) return "voicemail";
  if (truthy(a.wrong_number) || summary.includes("wrong number")) return "wrong-number";
  if (truthy(a.not_interested) || summary.includes("not interested")) return "not-interested";
  if (truthy(a.callback_requested) || /call ?back/.test(summary)) return "callback";
  if (truthy(a.interested) || summary.includes("interested")) return "interested";
  if (answeredBy === "no-answer" || !call.call_length) return call.error_message ? "failed" : "no-answer";
  return "completed";
}

export const RETRYABLE_OUTCOMES: Outcome[] = ["no-answer", "voicemail", "failed"];
