"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ThumbsUp, ThumbsDown, MailX, Clock, Megaphone, Flame, Thermometer, ShieldCheck, Phone, Mail, ArrowRight,
} from "lucide-react";
import { Card, SectionHeader, StatCard, RateBar, StatusChip, PeriodSelect, periodRangeLabel, Empty } from "@/components/kit";
import ComposeModal from "@/components/compose-modal";
import { useShell } from "@/components/shell-context";
import { avatarStyle, initials, timeAgo, pct, INTENT_LABEL, INTENT_CHIP, ROLE_LABEL, DEAL_STAGES, money } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { prettySubject } from "@/lib/labels";

type Overview = {
  days: number;
  cards: { positive: number; positiveDelta: number; negative: number; bounced: number; noResponse: number; emailed: number; activeCampaigns: number };
  today: { positive: number; declined: number; waiting: number };
  campaigns: Array<{ id: string; name: string; channel: string; status: string; owner_name: string; contacts: number; emailed: number; opened: number; replied: number; positive: number; calls: number; answered: number; demos: number }>;
  subjects: Array<{ subject: string; sends: number; opened: number; replied: number }>;
  funnel: { sent: number; delivered: number; opened: number; replied: number; positive: number };
  reps: Array<{ id: string; name: string; email: string; role: string; sent: number; positive: number; replied: number; inboxes: number }>;
  monitor: Array<{ id: string; fromName: string | null; fromEmail: string; clubName: string | null; snippet: string; receivedAt: string; intent: string | null; status: string; suggestedReply: string | null; suggestedReplySource: string | null; ownerName: string }>;
  hotLeads: Array<{ id: string; club_name: string; contact_name: string | null; phone: string; email: string | null; owner_name: string; opens_today: number; opens: number; clicks: number; last_at: string }>;
  pipeline: Record<string, { n: number; amount: number; recurring: boolean }>;
  dedup: { count: number; recent: Array<{ id: string; club_name: string; contact_name: string | null; prior_name: string | null; prior_at: string | null; blocked_name: string; channel: string }> };
};

function Pill({ tone, children }: { tone: "pos" | "neg" | "neu"; children: React.ReactNode }) {
  const cls = { pos: "chip-pos", neg: "chip-neg", neu: "chip-neutral" }[tone];
  return <span className={`chip ${cls} font-medium`}>{children}</span>;
}

export default function OverviewPage() {
  const { data: shell } = useShell();
  const [days, setDays] = useState(7);
  const [d, setD] = useState<Overview | null>(null);
  const [composeFor, setComposeFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/overview?days=${days}`, { cache: "no-store" });
    if (res.ok) setD(await res.json());
  }, [days]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const activeInboxes = shell.mailboxes.filter((m) => m.status === "active").length;
  const f = d?.funnel;
  const funnelRows = f ? [
    { label: "Sent", n: f.sent, color: "bg-blue-500" },
    { label: "Delivered", n: f.delivered, color: "bg-blue-500" },
    { label: "Opened", n: f.opened, color: "bg-purple-500" },
    { label: "Replied", n: f.replied, color: "bg-amber-500" },
    { label: "Positive", n: f.positive, color: "bg-green-500" },
  ] : [];

  const stages = DEAL_STAGES.filter((s) => s.id !== "lost");

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <h1 className="text-[15px] font-semibold text-gray-900">Overview</h1>
        <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1 tnum">{periodRangeLabel(days)}</span>
        <div className="ml-auto"><PeriodSelect days={days} onChange={setDays} /></div>
      </div>

      {/* AI banner */}
      <div className="rounded-[14px] border border-brand-200 px-4 py-3.5 flex items-center gap-3 flex-wrap"
        style={{ background: "linear-gradient(135deg, rgb(var(--brand) / var(--soft-alpha)) 0%, rgb(var(--bg-card)) 100%)" }}>
        <span className={activeInboxes ? "ai-pulse" : "ai-pulse idle"} />
        <span className="text-xs font-semibold text-brand-500">{activeInboxes ? (shell.aiEnabled ? "AI scanning live" : "Reply scanning live") : "Connect an inbox to start"}</span>
        <span className="text-xs text-gray-500">
          {activeInboxes
            ? `Monitoring ${activeInboxes} inbox${activeInboxes === 1 ? "" : "es"} · ${shell.threads.toLocaleString()} threads tracked · last scan ${timeAgo(shell.lastScanAt)}`
            : <>Replies are classified automatically once Gmail or Outlook is connected in <Link href="/settings#inboxes" className="text-brand-500 hover:underline">Settings</Link>.</>}
        </span>
        <div className="ml-auto flex gap-1.5 flex-wrap">
          <Pill tone="pos">{d?.today.positive ?? 0} positive today</Pill>
          <Pill tone="neg">{d?.today.declined ?? 0} not interested</Pill>
          <Pill tone="neu">{d?.today.waiting ?? 0} need follow-up</Pill>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard tone="pos" icon={ThumbsUp} label="Positive replies" value={d?.cards.positive ?? "—"} href="/inbox?intent=positive"
          sub={d ? `${d.cards.positiveDelta >= 0 ? "+" : ""}${d.cards.positiveDelta} vs previous period` : ""} />
        <StatCard tone="neg" icon={ThumbsDown} label="Negative replies" value={d?.cards.negative ?? "—"} sub="Not interested / wrong fit" />
        <StatCard tone="warn" icon={MailX} label="Bounced" value={d?.cards.bounced ?? "—"} sub="Invalid addresses" />
        <StatCard tone="neu" icon={Clock} label="No response" value={d?.cards.noResponse ?? "—"} sub="Eligible for follow-up" />
        <StatCard tone="info" icon={Megaphone} label="Active campaigns" value={d?.cards.activeCampaigns ?? "—"} sub={`${d?.cards.activeCampaigns ?? 0} running`} href="/campaigns" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
        {/* Left column */}
        <div className="flex flex-col gap-4 min-w-0">
          <div>
            <SectionHeader title="Active campaigns" tag={d?.campaigns.filter((c) => c.status === "active").length ?? 0}
              action={<Link href="/campaigns" className="text-[11px] text-brand-500 hover:underline">All campaigns</Link>} />
            <Card>
              {d && d.campaigns.length === 0 ? <Empty>No running campaigns. <Link href="/campaigns/new" className="text-brand-500 hover:underline">Create one</Link>.</Empty> : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {["Campaign", "Open rate", "Reply rate", "Status"].map((h) => <th key={h} className="eyebrow text-left px-4 py-2.5">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {d?.campaigns.map((c) => {
                      const call = c.channel === "call";
                      const open = call ? pct(c.answered, c.calls) : pct(c.opened, c.emailed);
                      const reply = call ? pct(c.demos, c.answered) : pct(c.replied, c.emailed);
                      return (
                        <tr key={c.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <Link href={`/campaigns/${c.id}`} className="text-xs font-medium text-gray-900 hover:text-brand-500 flex items-center gap-1.5">
                              {call ? <Phone className="w-3 h-3 text-gray-400" /> : <Mail className="w-3 h-3 text-gray-400" />}{c.name}
                            </Link>
                            <p className="text-[11px] text-gray-400">{c.contacts} contacts · {c.owner_name}</p>
                          </td>
                          <td className="px-4 py-2.5 w-[22%]" title={call ? "Answered calls" : "Contacts who opened"}><RateBar value={open} /></td>
                          <td className="px-4 py-2.5 w-[22%]" title={call ? "Answered calls wanting a demo" : "Contacts who replied"}><RateBar value={reply} tone="pos" /></td>
                          <td className="px-4 py-2.5"><StatusChip status={c.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <SectionHeader title="Subject line performance" action={<Link href="/analytics" className="text-[11px] text-brand-500 hover:underline">Full report</Link>} />
              <Card>
                {d && d.subjects.length === 0 ? <Empty>Subject line stats appear after your first sends.</Empty> : d?.subjects.map((s) => (
                  <div key={s.subject} className="px-4 py-2.5 border-b border-gray-200 last:border-0 flex flex-col gap-1.5">
                    <p className="text-[11px] font-medium text-gray-900 font-mono break-words">{prettySubject(s.subject)}</p>
                    <div className="flex gap-4">
                      {[
                        { v: `${pct(s.opened, s.sends)}%`, l: "Open", c: "text-blue-500" },
                        { v: `${pct(s.replied, s.sends)}%`, l: "Reply", c: "text-green-500" },
                        { v: s.sends, l: "Sends", c: "text-gray-900" },
                      ].map((m) => (
                        <div key={m.l}>
                          <p className={cn("text-[13px] font-semibold tnum", m.c)}>{m.v}</p>
                          <p className="text-[9px] uppercase tracking-[0.06em] text-gray-400">{m.l}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </Card>
            </div>

            <div>
              <SectionHeader title="Outreach funnel" />
              <Card>
                {funnelRows.map((r) => {
                  const p = pct(r.n, f?.sent ?? 0);
                  return (
                    <div key={r.label} className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 last:border-0">
                      <span className="text-[11px] text-gray-500 w-[70px] shrink-0">{r.label}</span>
                      <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                        <div className={cn("h-full rounded flex items-center justify-end pr-1.5", r.color)} style={{ width: `${Math.max(p, r.n ? 2 : 0)}%` }}>
                          {p >= 14 && <span className="text-[10px] font-semibold text-white tnum">{p}%</span>}
                        </div>
                      </div>
                      {p < 14 && <span className="text-[10px] font-semibold tnum text-gray-500 w-8">{p}%</span>}
                      <span className="text-[11px] tnum text-gray-400 w-10 text-right">{r.n.toLocaleString()}</span>
                    </div>
                  );
                })}
              </Card>
            </div>
          </div>

          <div>
            <SectionHeader title={d && d.reps.length > 1 ? "Rep activity" : "Your activity"} action={<Link href="/team" className="text-[11px] text-brand-500 hover:underline">{d && d.reps.length > 1 ? "Team" : ""}</Link>} />
            <Card>
              {d?.reps.map((r) => (
                <div key={r.id} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-gray-200 last:border-0">
                  <span className={cn("w-[30px] h-[30px] rounded-full text-[11px] font-semibold flex items-center justify-center shrink-0", avatarStyle(r.email))}>{initials(r.name)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900">{r.name}</p>
                    <p className="text-[10px] text-gray-400">{ROLE_LABEL[r.role] ?? r.role}{r.inboxes === 0 && " · no inbox connected"}</p>
                  </div>
                  {[{ v: r.sent, l: "Sent" }, { v: r.replied, l: "Replies" }, { v: r.positive, l: "Positive" }].map((m) => (
                    <div key={m.l} className="text-right w-14">
                      <p className="text-[13px] font-semibold tnum text-gray-900">{m.v}</p>
                      <p className="text-[9px] uppercase tracking-[0.05em] text-gray-400">{m.l}</p>
                    </div>
                  ))}
                </div>
              ))}
            </Card>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4 min-w-0">
          <div>
            <SectionHeader title="AI reply monitor" tag={shell.unread || undefined}
              action={<Link href="/inbox" className="text-[11px] text-brand-500 hover:underline flex items-center gap-1">Open inbox<ArrowRight className="w-3 h-3" /></Link>} />
            <Card>
              {d && d.monitor.length === 0 ? <Empty>Replies to your outreach will appear here, sorted by intent.</Empty> : d?.monitor.map((m) => (
                <Link key={m.id} href={`/inbox?id=${m.id}`} className="block px-4 py-3 border-b border-gray-200 last:border-0 hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="w-[26px] h-[26px] rounded-full bg-gray-100 border border-gray-200 text-[10px] font-semibold flex items-center justify-center text-gray-500 shrink-0">
                      {initials(m.fromName || m.fromEmail)}
                    </span>
                    <span className="text-xs font-medium text-gray-900 truncate">{m.fromName || m.fromEmail}</span>
                    {m.intent && <span className={INTENT_CHIP[m.intent]}>{INTENT_LABEL[m.intent]}</span>}
                    <span className="text-[10px] text-gray-400 ml-auto shrink-0">{timeAgo(m.receivedAt)}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed mt-1 line-clamp-2">{m.snippet}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-gray-400">→ {m.ownerName}{m.clubName ? ` · ${m.clubName}` : ""}</span>
                    <span className={cn("ml-auto text-[10px] font-semibold rounded px-1.5 py-0.5",
                      m.status === "new" ? "text-brand-500 bg-brand-50" : "text-gray-400 bg-gray-100")}>
                      {m.status === "new" ? (m.suggestedReply ? (m.suggestedReplySource === "ai" ? "AI draft ready" : "Draft ready") : "Review") : m.status === "replied" ? "Replied" : m.status === "snoozed" ? "Snoozed" : "Archived"}
                    </span>
                  </div>
                </Link>
              ))}
            </Card>
          </div>

          <div>
            <SectionHeader title="Hot lead signals" tag={`${d?.hotLeads.length ?? 0} active`} />
            <Card>
              {d && d.hotLeads.length === 0 ? <Empty>Contacts who open your emails repeatedly or click a link show up here.</Empty> : d?.hotLeads.map((h) => (
                <div key={h.id} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-gray-200 last:border-0">
                  {h.opens_today >= 3 || h.clicks > 0 ? <Flame className="w-4 h-4 text-orange-500 shrink-0" /> : <Thermometer className="w-4 h-4 text-amber-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{h.contact_name ? `${h.contact_name} · ` : ""}{h.club_name}</p>
                    <p className="text-[11px] text-gray-500">
                      {h.opens_today > 0 ? `Opened ${h.opens_today}× today` : `Opened ${h.opens}× this week`}{h.clicks > 0 ? ` · ${h.clicks} click${h.clicks > 1 ? "s" : ""}` : ""} · last {timeAgo(h.last_at)}
                    </p>
                  </div>
                  <span className="chip chip-warn">{h.opens} opens</span>
                  {h.phone ? (
                    <a href={`tel:${h.phone}`} className="text-[10px] font-semibold text-brand-500 bg-brand-50 rounded px-2 py-1 whitespace-nowrap">Call now</a>
                  ) : (
                    <button onClick={() => setComposeFor(h.id)} className="text-[10px] font-semibold text-brand-500 bg-brand-50 rounded px-2 py-1 whitespace-nowrap">Send follow-up</button>
                  )}
                  {h.phone && h.email && (
                    <button onClick={() => setComposeFor(h.id)} title="Send follow-up" className="p-1 text-gray-400 hover:text-brand-500"><Mail className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              ))}
            </Card>
          </div>

          <div>
            <SectionHeader title="Revenue pipeline" action={<Link href="/pipeline" className="text-[11px] text-brand-500 hover:underline">Pipeline</Link>} />
            <Card>
              {stages.map((s, i) => {
                const row = d?.pipeline[s.id];
                const prev = i > 0 ? d?.pipeline[stages[i - 1].id]?.n ?? 0 : 0;
                const n = row?.n ?? 0;
                return (
                  <div key={s.id} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-gray-200 last:border-0">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", s.dot)} />
                    <span className="text-xs text-gray-500 flex-1">{s.label}</span>
                    {i > 0 && prev > 0 && <span className="text-[10px] text-gray-400 tnum">{pct(n, prev)}% conv.</span>}
                    <span className="text-base font-semibold tnum text-gray-900 w-8 text-right">{n}</span>
                    <span className="text-[11px] text-gray-400 min-w-[64px] text-right tnum">{row?.amount ? money(row.amount, row.recurring) : ""}</span>
                  </div>
                );
              })}
            </Card>
          </div>

          <div>
            <SectionHeader title="Dedup shield" tag={`${d?.dedup.count ?? 0} blocked`} />
            <Card>
              {d && d.dedup.recent.length === 0 ? <Empty>No double-contacts. Prospects a teammate reached recently are skipped automatically.</Empty> : d?.dedup.recent.map((b) => (
                <div key={b.id} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-gray-200 last:border-0">
                  <ShieldCheck className="w-4 h-4 text-brand-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{b.contact_name ? `${b.contact_name} · ` : ""}{b.club_name}</p>
                    <p className="text-[11px] text-gray-500">{b.channel === "call" ? "Called" : "Emailed"} by {b.prior_name ?? "a teammate"}{b.prior_at ? ` ${timeAgo(b.prior_at)}` : ""} · {b.blocked_name}&apos;s campaign skipped it</p>
                  </div>
                  <span className="chip chip-neg">Blocked</span>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>

      {composeFor && <ComposeModal contactId={composeFor} onClose={() => setComposeFor(null)} onSent={load} />}
    </div>
  );
}
