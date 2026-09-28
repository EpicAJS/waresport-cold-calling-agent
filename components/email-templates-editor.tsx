"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, Sparkles, Loader2 } from "lucide-react";
import type { EmailTemplate, EmailTemplates } from "@/lib/db/schema";
import { TEMPLATE_VARIABLES } from "@/lib/templates";
import { inputCls } from "@/lib/labels";

type Props = {
  value: EmailTemplates;
  onChange: (v: EmailTemplates) => void;
  channel: "call" | "email";
  brief?: string;
};

function TemplateFields({ t, onChange }: { t: EmailTemplate; onChange: (t: EmailTemplate) => void }) {
  return (
    <div className="space-y-2">
      <input className={inputCls} placeholder="Subject" value={t.subject} onChange={(e) => onChange({ ...t, subject: e.target.value })} />
      <textarea
        className={`${inputCls} h-40 resize-y font-mono text-xs leading-relaxed`}
        value={t.body}
        onChange={(e) => onChange({ ...t, body: e.target.value })}
      />
    </div>
  );
}

function Section({ title, hint, children, defaultOpen = false }: { title: string; hint: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50">
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <span className="text-sm font-medium text-gray-800">{title}</span>
        <span className="text-xs text-gray-400 ml-auto">{hint}</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">{children}</div>}
    </div>
  );
}

function Steps<K extends "delay_days" | "delay_hours">({
  steps, delayKey, unit, onChange, brief,
}: {
  steps: Array<EmailTemplate & Record<K, number>>;
  delayKey: K;
  unit: string;
  onChange: (s: Array<EmailTemplate & Record<K, number>>) => void;
  brief?: string;
}) {
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<EmailTemplate & Record<K, number>>) =>
    onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const draft = async () => {
    setDrafting(true);
    setError(null);
    const res = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "emails",
        count: steps.length || 3,
        brief: brief || "",
        current: steps.map((s, i) => `Email ${i + 1}\nSubject: ${s.subject}\n${s.body}`).join("\n\n"),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setDrafting(false);
    if (!res.ok) return setError(data.error ?? "AI draft failed.");
    onChange(
      data.steps.map((s: EmailTemplate, i: number) => ({ ...s, [delayKey]: steps[i]?.[delayKey] ?? i * 3 }) as EmailTemplate & Record<K, number>)
    );
  };

  return (
    <div className="space-y-4">
      {steps.map((s, i) => (
        <div key={i} className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-semibold text-gray-700">Email {i + 1}</span>
            <span className="ml-2">Send</span>
            <input
              type="number"
              min={0}
              className="w-16 border border-gray-200 rounded px-2 py-1 text-xs"
              value={s[delayKey]}
              onChange={(e) => update(i, { [delayKey]: Math.max(0, Number(e.target.value)) } as Partial<EmailTemplate & Record<K, number>>)}
            />
            <span>{unit}</span>
            <button type="button" onClick={() => onChange(steps.filter((_, j) => j !== i))} className="ml-auto p-1 text-gray-400 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <TemplateFields t={s} onChange={(t) => update(i, t as Partial<EmailTemplate & Record<K, number>>)} />
        </div>
      ))}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={steps.length >= 10}
          onClick={() => onChange([...steps, { subject: "", body: "", [delayKey]: (steps.at(-1)?.[delayKey] ?? 0) + 3 } as EmailTemplate & Record<K, number>])}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" />Add email
        </button>
        <button
          type="button"
          onClick={draft}
          disabled={drafting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-purple-200 rounded-lg text-purple-700 hover:bg-purple-50 disabled:opacity-50"
        >
          {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {steps.length ? "Rewrite with AI" : "Draft with AI"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function EmailTemplatesEditor({ value, onChange, channel, brief }: Props) {
  const set = <K extends keyof EmailTemplates>(k: K, v: EmailTemplates[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Placeholders: {TEMPLATE_VARIABLES.map((v) => <code key={v} className="bg-gray-100 px-1 rounded mr-1">{`{{${v}}}`}</code>)}.
        An unsubscribe link and your company address are added to every email automatically.
      </p>

      {channel === "email" && (
        <Section title="Cold email sequence" hint={`${value.cold.length} emails · stops when they book`} defaultOpen>
          <Steps steps={value.cold} delayKey="delay_days" unit="business days after the first email" onChange={(s) => set("cold", s)} brief={brief} />
        </Section>
      )}

      {channel === "call" && (
        <>
          <Section title="Booking link email" hint="right after they say yes to a demo">
            <TemplateFields t={value.booking_link} onChange={(t) => set("booking_link", t)} />
          </Section>
          <Section title="Post-call follow-ups" hint={`${value.post_call.length} emails · interested, callback, or unreached after all retries`}>
            <Steps steps={value.post_call} delayKey="delay_days" unit="business days after the call" onChange={(s) => set("post_call", s)} brief={brief} />
          </Section>
        </>
      )}

      <Section title="Demo reminders" hint="24 hours and 1 hour before the booked time">
        <p className="text-xs font-medium text-gray-600">24 hours before</p>
        <TemplateFields t={value.reminder_24h} onChange={(t) => set("reminder_24h", t)} />
        <p className="text-xs font-medium text-gray-600 pt-2">1 hour before</p>
        <TemplateFields t={value.reminder_1h} onChange={(t) => set("reminder_1h", t)} />
      </Section>

      <Section title="Post-demo follow-ups" hint={`${value.post_demo.length} emails after the demo`}>
        <Steps steps={value.post_demo} delayKey="delay_hours" unit="hours after the demo ends" onChange={(s) => set("post_demo", s)} brief={brief} />
      </Section>
    </div>
  );
}
