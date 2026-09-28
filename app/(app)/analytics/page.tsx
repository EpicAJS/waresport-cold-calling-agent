"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { TrendingUp, Phone, Calendar, Clock, RefreshCw } from "lucide-react";
import { NOT_ANSWERED, OUTCOME_HEX, OUTCOME_LABEL } from "@/lib/labels";

const OUTCOME_LABELS = OUTCOME_LABEL;

type AnyCall = { id: string; status: string; outcome: string; duration: number; campaignId: string; campaignName: string; scheduledFor: string; endedAt: string | null };
type Campaign = { id: string; name: string; demosScheduled: number };

function fmt(s: number) {
  if (!s) return "—";
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function buildStats(calls: AnyCall[], campaigns: Campaign[]) {
  const total = calls.length;
  const answered = calls.filter((c) => !NOT_ANSWERED.includes(c.outcome)).length;
  const scheduledDemos = campaigns.reduce((a, c) => a + c.demosScheduled, 0);
  const demos = calls.filter((c) => c.outcome === "demo-booked").length;
  const pickupRate = total > 0 ? Math.round((answered / total) * 100) : 0;
  const demoRate = answered > 0 ? Math.round((demos / answered) * 100) : 0;
  const totalDur = calls.filter((c) => c.duration > 0).reduce((a, c) => a + c.duration, 0);
  const avgDur = answered > 0 ? Math.round(totalDur / answered) : 0;

  const outcomeCounts: Record<string, number> = {};
  calls.forEach((c) => { outcomeCounts[c.outcome] = (outcomeCounts[c.outcome] ?? 0) + 1; });

  const pie = Object.entries(outcomeCounts).map(([k, v]) => ({
    name: OUTCOME_LABELS[k] ?? k,
    value: v,
    color: OUTCOME_HEX[k] ?? "#9ca3af",
  }));

  const funnelData = [
    { name: "Calls Made", value: total, fill: "#3b82f6" },
    { name: "Answered", value: answered, fill: "#6366f1" },
    { name: "Engaged (>30s)", value: calls.filter((c) => c.duration > 30).length, fill: "#8b5cf6" },
    { name: "Interested", value: calls.filter((c) => ["interested", "callback", "demo-booked"].includes(c.outcome)).length, fill: "#a855f7" },
    { name: "Wants Demo", value: demos, fill: "#f59e0b" },
    { name: "Demo Scheduled", value: scheduledDemos, fill: "#22c55e" },
  ];

  const byCampaign = Object.values(
    calls.reduce((acc, c) => {
      if (!acc[c.campaignId]) acc[c.campaignId] = { name: c.campaignName, calls: 0, demos: 0 };
      acc[c.campaignId].calls++;
      if (c.outcome === "demo-booked") acc[c.campaignId].demos++;
      return acc;
    }, {} as Record<string, { name: string; calls: number; demos: number }>)
  ).map((c) => ({ ...c, rate: c.calls > 0 ? Math.round((c.demos / c.calls) * 100) : 0 }));

  const avgByOutcome = Object.entries(
    calls.filter((c) => c.duration > 0).reduce((acc, c) => {
      if (!acc[c.outcome]) acc[c.outcome] = { total: 0, count: 0 };
      acc[c.outcome].total += c.duration;
      acc[c.outcome].count++;
      return acc;
    }, {} as Record<string, { total: number; count: number }>)
  ).map(([k, v]) => ({ outcome: OUTCOME_LABELS[k] ?? k, avg: Math.round(v.total / v.count) }))
    .sort((a, b) => b.avg - a.avg);

  const dailyData = Object.entries(
    calls.reduce((acc, c) => {
      const d = new Date(c.endedAt ?? c.scheduledFor);
      const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (!acc[date]) acc[date] = { t: new Date(d.toDateString()).getTime(), calls: 0, pickups: 0, demos: 0 };
      acc[date].calls++;
      if (!NOT_ANSWERED.includes(c.outcome)) acc[date].pickups++;
      if (c.outcome === "demo-booked") acc[date].demos++;
      return acc;
    }, {} as Record<string, { t: number; calls: number; pickups: number; demos: number }>)
  )
    .sort(([, a], [, b]) => a.t - b.t)
    .slice(-30)
    .map(([date, { calls, pickups, demos }]) => ({ date, calls, pickups, demos }));

  return { total, answered, demos, pickupRate, demoRate, avgDur, pie, funnelData, byCampaign, avgByOutcome, dailyData };
}

export default function AnalyticsPage() {
  const [calls, setCalls] = useState<AnyCall[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [res, campRes] = await Promise.all([fetch("/api/calls"), fetch("/api/campaigns")]);
      const live: AnyCall[] = (await res.json()).filter((c: AnyCall) => c.status !== "scheduled");
      setCalls(live);
      setCampaigns(await campRes.json());
      setIsLive(live.length > 0);
    } catch {
      setCalls([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const s = buildStats(calls, campaigns);

  const kpis = [
    { label: "Total Calls", value: String(s.total), sub: "All time", icon: Phone, color: "text-blue-500", bg: "bg-blue-50" },
    { label: "Pickup Rate", value: `${s.pickupRate}%`, sub: `${s.answered} answered`, icon: TrendingUp, color: "text-green-500", bg: "bg-green-50" },
    { label: "Demo Rate", value: `${s.demoRate}%`, sub: "answered calls wanting a demo", icon: Calendar, color: "text-purple-500", bg: "bg-purple-50" },
    { label: "Avg Call Length", value: fmt(s.avgDur), sub: "answered calls only", icon: Clock, color: "text-orange-500", bg: "bg-orange-50" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            {isLive && <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />Live</span>}
          </div>
          <p className="text-gray-500 text-sm mt-1">Performance across all campaigns</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />Refresh
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500 font-medium">{k.label}</p>
              <div className={`w-8 h-8 ${k.bg} rounded-lg flex items-center justify-center`}>
                <k.icon className={`w-4 h-4 ${k.color}`} />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{k.value}</p>
            <p className="text-xs text-gray-400 mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Funnel + Pie */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Conversion Funnel</h2>
          <div className="space-y-2">
            {s.funnelData.map((step) => {
              const pct = s.funnelData[0].value > 0 ? Math.round((step.value / s.funnelData[0].value) * 100) : 0;
              return (
                <div key={step.name}>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{step.name}</span>
                    <span className="font-medium text-gray-700">{step.value} <span className="text-gray-400">({pct}%)</span></span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div className="h-5 rounded-full" style={{ width: `${pct}%`, background: step.fill }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Outcome Breakdown</h2>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie data={s.pie} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value">
                  {s.pie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v} calls`]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {s.pie.map((o) => (
                <div key={o.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: o.color }} />
                    <span className="text-gray-500">{o.name}</span>
                  </div>
                  <span className="font-semibold text-gray-700">{o.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Daily Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Daily Call Volume</h2>
        {s.dailyData.length === 0 ? (
          <div className="flex items-center justify-center h-[220px] text-gray-300 text-sm">No call data yet</div>
        ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={s.dailyData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Bar dataKey="calls" fill="#dbeafe" radius={[4, 4, 0, 0]} name="Total Calls" />
            <Bar dataKey="pickups" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Pickups" />
            <Bar dataKey="demos" fill="#22c55e" radius={[4, 4, 0, 0]} name="Demos" />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>

      {/* Campaign Table + Avg Duration */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Campaign Performance</h2>
          {s.byCampaign.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-400 text-left border-b border-gray-100">
                  <th className="pb-2 font-medium">Campaign</th>
                  <th className="pb-2 font-medium text-right">Calls</th>
                  <th className="pb-2 font-medium text-right">Wants Demo</th>
                  <th className="pb-2 font-medium text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {s.byCampaign.map((c) => (
                  <tr key={c.name + c.calls} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 text-sm text-gray-700">{c.name}</td>
                    <td className="py-2.5 text-sm text-gray-500 text-right">{c.calls}</td>
                    <td className="py-2.5 text-sm text-green-600 font-medium text-right">{c.demos}</td>
                    <td className="py-2.5 text-right">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        c.rate >= 20 ? "bg-green-100 text-green-700" :
                        c.rate >= 10 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"
                      }`}>{c.rate}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No campaign data yet.</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Avg Call Duration by Outcome</h2>
          {s.avgByOutcome.length > 0 ? (
            <div className="space-y-3">
              {s.avgByOutcome.map((item) => {
                const maxSec = s.avgByOutcome[0]?.avg || 1;
                const pct = Math.round((item.avg / maxSec) * 100);
                return (
                  <div key={item.outcome}>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{item.outcome}</span>
                      <span className="font-medium text-gray-700">{fmt(item.avg)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No call duration data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
