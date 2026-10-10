"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import EmailList, { emailDisplayStatus, type EmailRow } from "@/components/email-list";

export default function EmailsPage() {
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/emails").catch(() => null);
    const data = res ? await res.json().catch(() => []) : [];
    setEmails(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const counts = emails.reduce<Record<string, number>>((acc, e) => {
    const s = emailDisplayStatus(e);
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const q = search.toLowerCase();
  const filtered = emails.filter((e) =>
    (status === "all" || emailDisplayStatus(e) === status) &&
    `${e.clubName} ${e.toEmail} ${e.subject} ${e.campaignName ?? ""}`.toLowerCase().includes(q)
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Emails</h1>
          <p className="text-gray-500 text-sm mt-1">
            {counts.sent ?? 0} sent · {(counts.pending ?? 0) + (counts.scheduled ?? 0)} upcoming · {counts.failed ?? 0} failed
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />Refresh
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Search emails..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All</option>
          <option value="pending">Queued</option>
          <option value="scheduled">Scheduled</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <EmailList emails={filtered} onChanged={load} />
    </div>
  );
}
