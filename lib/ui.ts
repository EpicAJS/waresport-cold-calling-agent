export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return days < 30 ? `${days}d ago` : new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function initials(name: string) {
  return name.split(/[\s@._-]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_STYLES = [
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-orange-100 text-orange-700",
  "bg-red-100 text-red-700",
];

export function avatarStyle(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_STYLES[h % AVATAR_STYLES.length];
}

export function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export const ROLE_LABEL: Record<string, string> = { admin: "Admin", rep: "Sales", intern: "Intern" };

export const INTENT_LABEL: Record<string, string> = {
  positive: "Interested",
  "needs-info": "Needs info",
  "not-interested": "Not interested",
  negative: "Negative",
  "out-of-office": "Out of office",
  bounce: "Bounced",
  other: "Other",
};

export const INTENT_CHIP: Record<string, string> = {
  positive: "chip chip-pos",
  "needs-info": "chip chip-info",
  "not-interested": "chip chip-warn",
  negative: "chip chip-neg",
  "out-of-office": "chip chip-neutral",
  bounce: "chip chip-neg",
  other: "chip chip-neutral",
};

export const DEAL_STAGES = [
  { id: "positive", label: "Positive reply", dot: "bg-green-500" },
  { id: "demo-booked", label: "Demo booked", dot: "bg-blue-500" },
  { id: "demo-held", label: "Demo held", dot: "bg-purple-500" },
  { id: "proposal", label: "Proposal sent", dot: "bg-amber-500" },
  { id: "won", label: "Closed won", dot: "bg-green-600" },
  { id: "lost", label: "Closed lost", dot: "bg-gray-400" },
] as const;

export function money(n: number | null | undefined, recurring = false) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US")}${recurring ? "/mo" : ""}`;
}
