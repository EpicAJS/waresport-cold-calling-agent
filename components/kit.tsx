"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function SectionHeader({ title, tag, action }: { title: string; tag?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <h2 className="section-title">{title}</h2>
        {tag !== undefined && tag !== null && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500">{tag}</span>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, sub, tone, icon: Icon, href }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; tone: "pos" | "neg" | "warn" | "neu" | "info"; icon?: React.ElementType; href?: string;
}) {
  const body = (
    <div className={cn("relative overflow-hidden bg-white border border-gray-200 rounded-[14px] p-4 stat-strip h-full", tone, href && "hover:border-gray-300 transition-colors")}>
      {Icon && <Icon className="absolute top-3.5 right-3.5 w-[18px] h-[18px] opacity-20" />}
      <p className="text-[11px] text-gray-400 font-medium uppercase tracking-[0.05em]">{label}</p>
      <p className="text-[28px] font-semibold text-gray-900 mt-1.5 mb-0.5 leading-none tnum">{value}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function RateBar({ value, tone = "info" }: { value: number; tone?: "info" | "pos" | "warn" | "neg" }) {
  const color = { info: "bg-blue-500", pos: "bg-green-500", warn: "bg-amber-500", neg: "bg-red-500" }[tone];
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-[5px] bg-gray-100 rounded-full overflow-hidden min-w-[60px]">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="text-[11px] tnum text-gray-500 min-w-[30px] text-right">{value}%</span>
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  const cls = status === "active" ? "chip chip-pos" : status === "paused" ? "chip chip-warn" : status === "draft" ? "chip chip-info" : "chip chip-neutral";
  const label = status === "active" ? "Live" : status[0].toUpperCase() + status.slice(1);
  return <span className={cls}>{label}</span>;
}

export const PERIODS = [
  { days: 1, label: "Today" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

export function PeriodSelect({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <select value={days} onChange={(e) => onChange(Number(e.target.value))}
      className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1">
      {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
    </select>
  );
}

export function periodRangeLabel(days: number) {
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 3600e3);
  const f = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(start)} — ${f(end)}, ${end.getFullYear()}`;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-400 text-center py-8 px-4">{children}</p>;
}
