export const OUTCOME_LABEL: Record<string, string> = {
  "demo-booked": "Wants Demo",
  interested: "Interested",
  callback: "Callback",
  "not-interested": "Not Interested",
  "do-not-call": "Do Not Call",
  voicemail: "Voicemail",
  "no-answer": "No Answer",
  "wrong-number": "Wrong Number",
  failed: "Failed",
  completed: "Completed",
  pending: "Queued",
  emailed: "Emailed",
  "dedup-blocked": "Skipped — teammate contacted",
  "no-email": "No email",
  "not-callable": "No phone",
  "demo-scheduled": "Demo scheduled",
  "replied-positive": "Replied — interested",
  "replied-needs-info": "Replied — needs info",
  "replied-not-interested": "Replied — not interested",
  "replied-negative": "Replied — negative",
  "replied-other": "Replied",
};

export const OUTCOME_COLOR: Record<string, string> = {
  "demo-booked": "bg-green-100 text-green-700",
  interested: "bg-blue-100 text-blue-700",
  callback: "bg-yellow-100 text-yellow-700",
  "not-interested": "bg-gray-100 text-gray-600",
  "do-not-call": "bg-red-100 text-red-700",
  voicemail: "bg-purple-100 text-purple-700",
  "no-answer": "bg-gray-100 text-gray-600",
  "wrong-number": "bg-orange-100 text-orange-700",
  failed: "bg-red-100 text-red-700",
  completed: "bg-gray-100 text-gray-600",
  pending: "bg-gray-100 text-gray-500",
};

export const OUTCOME_HEX: Record<string, string> = {
  "demo-booked": "#22c55e",
  interested: "#3b82f6",
  callback: "#f59e0b",
  "not-interested": "#6b7280",
  "do-not-call": "#ef4444",
  voicemail: "#8b5cf6",
  "no-answer": "#9ca3af",
  "wrong-number": "#f97316",
  failed: "#dc2626",
  completed: "#64748b",
  pending: "#d1d5db",
};

export const NOT_ANSWERED = ["no-answer", "voicemail", "failed", "pending"];

export const STAGE_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  interested: "Interested",
  "demo-requested": "Wants Demo",
  "demo-scheduled": "Demo Scheduled",
  "not-interested": "Not Interested",
  "do-not-call": "Do Not Call",
  "wrong-number": "Wrong Number",
};

export const STAGE_COLOR: Record<string, string> = {
  new: "bg-gray-100 text-gray-600",
  contacted: "bg-slate-100 text-slate-700",
  interested: "bg-blue-100 text-blue-700",
  "demo-requested": "bg-amber-100 text-amber-700",
  "demo-scheduled": "bg-green-100 text-green-700",
  "not-interested": "bg-gray-100 text-gray-500",
  "do-not-call": "bg-red-100 text-red-700",
  "wrong-number": "bg-orange-100 text-orange-700",
};

export const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  draft: "bg-gray-100 text-gray-600",
  completed: "bg-blue-100 text-blue-700",
};

export const EMAIL_KIND_LABEL = (kind: string) => {
  if (kind === "booking_link") return "Booking link";
  if (kind === "reminder_24h") return "Reminder (24h)";
  if (kind === "reminder_1h") return "Reminder (1h)";
  if (kind === "manual") return "Sent by hand";
  if (kind === "followup") return "Follow-up";
  if (kind === "reply") return "Reply";
  const m = kind.match(/^(post_call|post_demo|cold)_(\d+)$/);
  if (m) return `${{ post_call: "Post-call", post_demo: "Post-demo", cold: "Cold email" }[m[1]]} #${m[2]}`;
  return kind;
};

export const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Phoenix", label: "Arizona (MST)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
];

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

/** Shows template placeholders like {{club_name}} as {club_name} for readability. */
export function prettySubject(subject: string) {
  return subject.replace(/\{\{\s*(\w+)\s*\}\}/g, "{$1}");
}
