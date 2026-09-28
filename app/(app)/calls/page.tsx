"use client";

import { useState, useEffect } from "react";
import { Search, RefreshCw } from "lucide-react";
import CallList, { type CallRow } from "@/components/call-list";
import { OUTCOME_LABEL } from "@/lib/labels";

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/calls").catch(() => null);
    const data = res ? await res.json().catch(() => []) : [];
    setCalls(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  const sync = async () => {
    setSyncing(true);
    await fetch("/api/calls/sync", { method: "POST" }).catch(() => null);
    setSyncing(false);
    load();
  };

  useEffect(() => { load(); }, []);

  const q = search.toLowerCase();
  const filtered = calls.filter((c) => {
    const matchSearch = c.clubName.toLowerCase().includes(q) || c.phone.includes(search) || c.campaignName.toLowerCase().includes(q);
    const matchOutcome = outcomeFilter === "all" || (outcomeFilter === "scheduled" ? c.status === "scheduled" : c.outcome === outcomeFilter && c.status !== "scheduled");
    return matchSearch && matchOutcome;
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calls</h1>
          <p className="text-gray-500 text-sm mt-1">
            {calls.filter((c) => c.status !== "scheduled").length} completed · {calls.filter((c) => c.status === "scheduled").length} scheduled
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={sync} disabled={syncing} className="flex items-center gap-2 px-3 py-2 border border-blue-200 text-blue-600 rounded-lg text-sm hover:bg-blue-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />Check results
          </button>
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />Refresh
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search by club, phone, campaign..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700" value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}>
          <option value="all">All outcomes</option>
          <option value="scheduled">Scheduled</option>
          {["demo-booked", "interested", "callback", "not-interested", "do-not-call", "voicemail", "no-answer", "wrong-number", "failed"].map((o) => (
            <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>
          ))}
        </select>
      </div>

      {loading && calls.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading calls...</div>
      ) : (
        <CallList calls={filtered} onChanged={load} />
      )}
    </div>
  );
}
