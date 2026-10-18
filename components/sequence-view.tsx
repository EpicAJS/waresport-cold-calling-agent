"use client";

import { Sparkles } from "lucide-react";
import type { EmailTemplates } from "@/lib/db/schema";
import { pct } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { prettySubject } from "@/lib/labels";

type StepStat = { kind: string; sent: number; queued: number; opened: number; replied: number; bounced: number };

const STEP_TITLES = ["Initial outreach", "Follow-up 1", "Follow-up 2", "Follow-up 3", "Follow-up 4", "Follow-up 5"];

/** The campaign's email steps with timing and per-step open/reply rates. */
export default function SequenceView({ channel, templates, steps, aiPersonalize, enrolled, status }: {
  channel: "call" | "email";
  templates: EmailTemplates;
  steps: StepStat[];
  aiPersonalize: boolean;
  enrolled: number;
  status: string;
}) {
  const prefix = channel === "email" ? "cold" : "post_call";
  const seq = channel === "email" ? templates.cold : templates.post_call;
  const stat = (k: string) => steps.find((s) => s.kind === k);

  const rows = seq.map((t, i) => {
    const last = i === seq.length - 1 && i > 0;
    return {
      key: `${prefix}_${i + 1}`,
      title: last && seq.length > 2 ? "Break-up email" : STEP_TITLES[i] ?? `Step ${i + 1}`,
      timing: i === 0
        ? channel === "email" ? "Sends on enroll" : "Right after the call"
        : `${t.delay_days} business day${t.delay_days === 1 ? "" : "s"} later if no reply${last ? " · final touch" : ""}`,
      subject: t.subject,
    };
  });
  if (channel === "call") rows.unshift({ key: "booking_link", title: "Booking link", timing: "When they say yes to a demo", subject: templates.booking_link.subject });

  return (
    <div className="bg-white border border-gray-200 rounded-[14px] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        <h2 className="text-[13px] font-semibold text-gray-900">Email sequence</h2>
        <span className="text-[11px] text-gray-500">{status === "active" ? "Active" : status[0].toUpperCase() + status.slice(1)} · {enrolled} contacts enrolled</span>
        {aiPersonalize && <span className="ml-auto chip chip-info flex items-center gap-1"><Sparkles className="w-3 h-3" />AI personalization on</span>}
      </div>
      {rows.map((r, i) => {
        const s = stat(r.key);
        return (
          <div key={r.key} className="relative flex items-center px-4 py-3 border-b border-gray-200 last:border-0">
            {i < rows.length - 1 && <span className="absolute left-[28px] top-[38px] w-px h-[calc(100%-14px)] bg-gray-200" />}
            <span className="w-[26px] h-[26px] rounded-full bg-gray-100 border border-gray-300 text-[11px] font-semibold flex items-center justify-center text-gray-500 shrink-0 z-[1]">{i + 1}</span>
            <div className="flex-1 min-w-0 pl-2.5">
              <p className="text-xs font-medium text-gray-900">{r.title}</p>
              <p className="text-[11px] text-gray-400">{r.timing}</p>
              <p className="text-[11px] text-gray-500 font-mono truncate">{prettySubject(r.subject)}</p>
            </div>
            <div className="flex gap-4 shrink-0">
              {[
                { v: s?.sent ?? 0, l: "Sent", c: "text-gray-900", raw: true },
                { v: pct(s?.opened ?? 0, s?.sent ?? 0), l: "Opened", c: "text-blue-500" },
                { v: pct(s?.replied ?? 0, s?.sent ?? 0), l: "Replied", c: "text-green-500" },
              ].map((m) => (
                <div key={m.l} className="text-right w-12">
                  <p className={cn("text-xs font-semibold tnum", m.c)}>{m.v}{m.raw ? "" : "%"}</p>
                  <p className="text-[9px] uppercase tracking-[0.05em] text-gray-400">{m.l}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
