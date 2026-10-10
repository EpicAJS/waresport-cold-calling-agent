"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ThumbsUp, ThumbsDown, MailX, Clock, Reply, ArrowUpDown, Phone, Mail } from "lucide-react";
import { Card, SectionHeader, StatCard, RateBar, StatusChip, PeriodSelect, periodRangeLabel, Empty } from "@/components/kit";
import { useThemeVars } from "@/components/use-theme-vars";
import { avatarStyle, initials, pct, INTENT_LABEL, ROLE_LABEL } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { prettySubject } from "@/lib/labels";

type Data = {
  cards: { positive: number; positiveDelta: number; negative: number; bounced: number; noResponse: number; emailed: number };
  subjects: Array<{ subject: string; sends: number; opened: number; replied: number; bounced: number }>;
  funnel: { sent: number; delivered: number; opened: number; replied: number; positive: number };
  reps: Array<{ id: string; name: string; email: string; role: string; sent: number; opened: number; replied: number; positive: number; negative: number; bounced: number; calls: number; inboxes: number }>;
  series: Array<{ day: string; sent: number; opened: number; replied: number; positive: number }>;
  intents: Array<{ intent: string; n: number }>;
  calls: { calls: number; answered: number; demos: number };
  campaigns: Array<{ id: string; name: string; channel: string; status: string; owner_name: string; contacts: number; emailed: number; opened: number; replied: number; positive: number; calls: number; answered: number; demos: number }>;
};

const SERIES = [
  { key: "sent", label: "Sent", color: "series-1" },
  { key: "opened", label: "Opened", color: "series-2" },
  { key: "replied", label: "Replied", color: "series-3" },
  { key: "positive", label: "Positive", color: "series-4" },
] as const;

type SubjectSort = "sends" | "open" | "reply" | "bounce";

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [rep, setRep] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [sort, setSort] = useState<SubjectSort>("sends");
  const colors = useThemeVars(["series-1", "series-2", "series-3", "series-4", "border", "text-muted", "bg-surface", "text-primary"] as const);

  const load = useCallback(async () => {
    const res = await fetch(`/api/analytics?days=${days}${rep ? `&user=${rep}` : ""}`, { cache: "no-store" });
    if (res.ok) setD(await res.json());
  }, [days, rep]);
  useEffect(() => { load(); }, [load]);

  const subjects = useMemo(() => {
    const rows = [...(d?.subjects ?? [])].map((s) => ({ ...s, open: pct(s.opened, s.sends), reply: pct(s.replied, s.sends), bounce: pct(s.bounced, s.sends) }));
    return rows.sort((a, b) => (sort === "sends" ? b.sends - a.sends : b[sort] - a[sort] || b.sends - a.sends));
  }, [d, sort]);

  const replyRate = d ? pct(d.funnel.replied, d.funnel.sent) : 0;
  const totalIntents = d?.intents.reduce((a, i) => a + i.n, 0) ?? 0;
  const SortHead = ({ k, label }: { k: SubjectSort; label: string }) => (
    <th className="eyebrow text-left px-4 py-2.5">
      <button onClick={() => setSort(k)} className={cn("flex items-center gap-1", sort === k && "text-blue-500")}>{label}<ArrowUpDown className="w-3 h-3" /></button>
    </th>
  );

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-[15px] font-semibold text-gray-900">Analytics</h1>
        <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1 tnum">{periodRangeLabel(days)}</span>
        <div className="ml-auto flex gap-2">
          <select value={rep} onChange={(e) => setRep(e.target.value)} className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1">
            <option value="">Whole team</option>
            {d?.reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <PeriodSelect days={days} onChange={setDays} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard tone="pos" icon={ThumbsUp} label="Positive" value={d?.cards.positive ?? "—"} sub={d ? `${d.cards.positiveDelta >= 0 ? "+" : ""}${d.cards.positiveDelta} vs previous period` : ""} />
        <StatCard tone="neg" icon={ThumbsDown} label="Negative" value={d?.cards.negative ?? "—"} sub="Not interested / wrong fit" />
        <StatCard tone="warn" icon={MailX} label="Bounced" value={d?.cards.bounced ?? "—"} sub={d ? `${pct(d.cards.bounced, d.cards.emailed)}% of contacts emailed` : ""} />
        <StatCard tone="neu" icon={Clock} label="No response" value={d?.cards.noResponse ?? "—"} sub={d ? `of ${d.cards.emailed} contacts emailed` : ""} />
        <StatCard tone="info" icon={Reply} label="Reply rate" value={d ? `${replyRate}%` : "—"} sub={d ? `${pct(d.funnel.opened, d.funnel.sent)}% open rate` : ""} />
      </div>

      <div>
        <SectionHeader title="Email activity" action={
          <button onClick={() => setShowTable(!showTable)} className="text-[11px] text-blue-500 hover:underline">{showTable ? "Show chart" : "Show table"}</button>
        } />
        <Card className="p-4">
          <div className="flex gap-4 mb-3 flex-wrap">
            {SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="w-3 h-[2px] rounded" style={{ background: colors[s.color] }} />{s.label}
              </span>
            ))}
          </div>
          {showTable ? (
            <div className="max-h-[260px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-gray-400 text-left"><th className="py-1.5">Day</th>{SERIES.map((s) => <th key={s.key} className="py-1.5 text-right">{s.label}</th>)}</tr></thead>
                <tbody>{d?.series.map((r) => (
                  <tr key={r.day} className="border-t border-gray-200"><td className="py-1.5 text-gray-500">{r.day}</td>{SERIES.map((s) => <td key={s.key} className="py-1.5 text-right tnum text-gray-900">{r[s.key]}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={d?.series ?? []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: colors["text-muted"] }} tickLine={false} axisLine={{ stroke: colors.border }}
                  tickFormatter={(v: string) => new Date(v + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: colors["text-muted"] }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: colors["bg-surface"], border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: 12, color: colors["text-primary"] }}
                  labelFormatter={(v: string) => new Date(v + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  cursor={{ stroke: colors["text-muted"], strokeWidth: 1 }}
                />
                {SERIES.map((s) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colors[s.color]} strokeWidth={2} dot={false}
                    activeDot={{ r: 4, stroke: colors["bg-surface"], strokeWidth: 2 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div>
        <SectionHeader title="Subject line performance" tag={subjects.length} />
        <Card>
          {subjects.length === 0 ? <Empty>No emails sent in this period.</Empty> : (
            <table className="w-full">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                <th className="eyebrow text-left px-4 py-2.5">Subject</th>
                <SortHead k="sends" label="Sends" /><SortHead k="open" label="Open rate" /><SortHead k="reply" label="Reply rate" /><SortHead k="bounce" label="Bounced" />
              </tr></thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s.subject} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-[11px] font-mono text-gray-900 max-w-[420px]">{prettySubject(s.subject)}</td>
                    <td className="px-4 py-2.5 text-xs tnum text-gray-700">{s.sends}</td>
                    <td className="px-4 py-2.5 w-[18%]"><RateBar value={s.open} /></td>
                    <td className="px-4 py-2.5 w-[18%]"><RateBar value={s.reply} tone="pos" /></td>
                    <td className="px-4 py-2.5 text-xs tnum text-gray-500">{s.bounce}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 items-start">
        <div>
          <SectionHeader title="By rep" />
          <Card>
            <table className="w-full">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                {["Rep", "Sent", "Open rate", "Reply rate", "Positive", "Negative", "Bounced", "Calls"].map((h) => <th key={h} className="eyebrow text-left px-3 py-2.5">{h}</th>)}
              </tr></thead>
              <tbody>
                {d?.reps.map((r) => (
                  <tr key={r.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={cn("w-6 h-6 rounded-full text-[9px] font-semibold flex items-center justify-center", avatarStyle(r.email))}>{initials(r.name)}</span>
                        <div><p className="text-xs font-medium text-gray-900">{r.name}</p><p className="text-[10px] text-gray-400">{ROLE_LABEL[r.role]}{r.inboxes === 0 ? " · no inbox" : ""}</p></div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs tnum text-gray-700">{r.sent}</td>
                    <td className="px-3 py-2.5 w-[14%]"><RateBar value={pct(r.opened, r.sent)} /></td>
                    <td className="px-3 py-2.5 w-[14%]"><RateBar value={pct(r.replied, r.sent)} tone="pos" /></td>
                    <td className="px-3 py-2.5 text-xs tnum text-green-700">{r.positive}</td>
                    <td className="px-3 py-2.5 text-xs tnum text-red-700">{r.negative}</td>
                    <td className="px-3 py-2.5 text-xs tnum text-gray-500">{r.bounced}</td>
                    <td className="px-3 py-2.5 text-xs tnum text-gray-500">{r.calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <SectionHeader title="Reply intent" tag={totalIntents} />
            <Card className="p-4 space-y-2.5">
              {d && d.intents.length === 0 ? <Empty>No replies yet.</Empty> : d?.intents.map((i) => (
                <div key={i.intent}>
                  <div className="flex justify-between text-[11px] mb-1"><span className="text-gray-500">{INTENT_LABEL[i.intent] ?? i.intent}</span><span className="tnum text-gray-900 font-medium">{i.n} <span className="text-gray-400">({pct(i.n, totalIntents)}%)</span></span></div>
                  <div className="h-[5px] bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{ width: `${pct(i.n, totalIntents)}%` }} /></div>
                </div>
              ))}
            </Card>
          </div>
          <div>
            <SectionHeader title="AI calls" />
            <Card className="grid grid-cols-3">
              {[{ l: "Calls", v: d?.calls.calls }, { l: "Answered", v: d?.calls.answered }, { l: "Want demo", v: d?.calls.demos }].map((m) => (
                <div key={m.l} className="p-4 border-r border-gray-200 last:border-0">
                  <p className="text-xl font-semibold tnum text-gray-900">{m.v ?? "—"}</p>
                  <p className="eyebrow mt-0.5">{m.l}</p>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>

      <div>
        <SectionHeader title="Campaign performance" />
        <Card>
          {d && d.campaigns.length === 0 ? <Empty>No campaigns yet.</Empty> : (
            <table className="w-full">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                {["Campaign", "Contacts", "Open / answer rate", "Reply / demo rate", "Positive", "Status"].map((h) => <th key={h} className="eyebrow text-left px-4 py-2.5">{h}</th>)}
              </tr></thead>
              <tbody>
                {d?.campaigns.map((c) => {
                  const call = c.channel === "call";
                  return (
                    <tr key={c.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <Link href={`/campaigns/${c.id}`} className="text-xs font-medium text-gray-900 hover:text-blue-500 flex items-center gap-1.5">
                          {call ? <Phone className="w-3 h-3 text-gray-400" /> : <Mail className="w-3 h-3 text-gray-400" />}{c.name}
                        </Link>
                        <p className="text-[11px] text-gray-400">{c.owner_name}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs tnum text-gray-700">{c.contacts}</td>
                      <td className="px-4 py-2.5 w-[18%]"><RateBar value={call ? pct(c.answered, c.calls) : pct(c.opened, c.emailed)} /></td>
                      <td className="px-4 py-2.5 w-[18%]"><RateBar value={call ? pct(c.demos, c.answered) : pct(c.replied, c.emailed)} tone="pos" /></td>
                      <td className="px-4 py-2.5 text-xs tnum text-green-700">{call ? c.demos : c.positive}</td>
                      <td className="px-4 py-2.5"><StatusChip status={c.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
