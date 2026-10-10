"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, Empty } from "@/components/kit";
import { DEAL_STAGES, money, timeAgo } from "@/lib/ui";
import { inputCls } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Deal = {
  id: string; stage: string; amount: number | null; recurring: boolean; source: string; notes: string; stageChangedAt: string;
  contactId: string; clubName: string; contactName: string | null; email: string | null; phone: string; campaignName: string | null; ownerName: string;
};
type ContactOpt = { id: string; clubName: string };

const SOURCE_LABEL: Record<string, string> = { reply: "Email reply", call: "AI call", booking: "Booking", manual: "Manual" };

function DealCard({ deal, onChange, onDelete }: { deal: Deal; onChange: (patch: Partial<Deal>) => void; onDelete: () => void }) {
  const [amount, setAmount] = useState(deal.amount?.toString() ?? "");
  return (
    <div className="bg-white border border-gray-200 rounded-[10px] p-3 space-y-2">
      <div>
        <p className="text-xs font-medium text-gray-900">{deal.clubName}</p>
        <p className="text-[11px] text-gray-500">{[deal.contactName, deal.ownerName].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-gray-400">$</span>
        <input value={amount} inputMode="numeric" placeholder="Value"
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={() => amount !== (deal.amount?.toString() ?? "") && onChange({ amount: amount ? Number(amount) : null })}
          className="w-20 border border-gray-200 rounded px-1.5 py-0.5 text-[11px] tnum" />
        <label className="flex items-center gap-1 text-[10px] text-gray-500">
          <input type="checkbox" checked={deal.recurring} onChange={(e) => onChange({ recurring: e.target.checked })} />/mo
        </label>
      </div>
      <div className="flex items-center gap-1.5">
        <select value={deal.stage} onChange={(e) => onChange({ stage: e.target.value })} className="flex-1 border border-gray-200 rounded px-1.5 py-0.5 text-[11px]">
          {DEAL_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button onClick={onDelete} title="Remove deal" className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
      </div>
      <p className="text-[10px] text-gray-400">{SOURCE_LABEL[deal.source] ?? deal.source}{deal.campaignName ? ` · ${deal.campaignName}` : ""} · {timeAgo(deal.stageChangedAt)}</p>
    </div>
  );
}

export default function PipelinePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  const [adding, setAdding] = useState(false);
  const [newDeal, setNewDeal] = useState({ contactId: "", stage: "positive", amount: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/deals", { cache: "no-store" });
    if (res.ok) setDeals(await res.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  const update = async (id: string, patch: Partial<Deal>) => {
    setDeals((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    await fetch(`/api/deals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    load();
  };
  const remove = async (id: string) => {
    await fetch(`/api/deals/${id}`, { method: "DELETE" });
    load();
  };
  const openAdd = async () => {
    setAdding(true);
    const res = await fetch("/api/contacts");
    if (res.ok) setContacts(await res.json());
  };
  const create = async () => {
    setError(null);
    const res = await fetch("/api/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newDeal, amount: newDeal.amount || null }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Couldn't add the deal.");
    setAdding(false);
    setNewDeal({ contactId: "", stage: "positive", amount: "" });
    load();
  };

  const byStage = (id: string) => deals.filter((d) => d.stage === id);
  const won = byStage("won");
  const open = deals.filter((d) => !["won", "lost"].includes(d.stage));
  const sum = (ds: Deal[]) => ds.reduce((a, d) => a + (d.amount ?? 0), 0);

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <h1 className="text-[15px] font-semibold text-gray-900">Pipeline</h1>
        <span className="text-xs text-gray-500">{open.length} open · {money(sum(open))} open value · {won.length} won ({money(sum(won))})</span>
        <button onClick={openAdd} className="btn-primary ml-auto"><Plus className="w-3.5 h-3.5" />Add deal</button>
      </div>
      <p className="text-xs text-gray-500 -mt-3">Deals open automatically from positive email replies and calls, move to Demo booked when a demo is scheduled, and to Demo held once it has happened. Move them to Proposal and Closed yourself.</p>

      {adding && (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-[1fr_180px_140px] gap-2">
            <select className={inputCls} value={newDeal.contactId} onChange={(e) => setNewDeal({ ...newDeal, contactId: e.target.value })}>
              <option value="">Choose a contact…</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.clubName}</option>)}
            </select>
            <select className={inputCls} value={newDeal.stage} onChange={(e) => setNewDeal({ ...newDeal, stage: e.target.value })}>
              {DEAL_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <input className={inputCls} placeholder="Value ($)" value={newDeal.amount} onChange={(e) => setNewDeal({ ...newDeal, amount: e.target.value.replace(/[^\d]/g, "") })} />
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button onClick={create} disabled={!newDeal.contactId} className="btn-primary">Add</button>
            <button onClick={() => setAdding(false)} className="btn">Cancel</button>
          </div>
        </Card>
      )}

      <div className="overflow-x-auto pb-2">
      <div className="grid grid-cols-6 gap-3 min-w-[1100px]">
        {DEAL_STAGES.map((s) => {
          const items = byStage(s.id);
          return (
            <div key={s.id} className="flex flex-col gap-2 min-w-0">
              <div className="flex items-center gap-2 px-1">
                <span className={cn("w-2 h-2 rounded-full", s.dot)} />
                <span className="text-xs font-medium text-gray-700">{s.label}</span>
                <span className="text-xs tnum text-gray-400 ml-auto">{items.length}</span>
              </div>
              <p className="text-[10px] text-gray-400 px-1 tnum h-3">
                {sum(items) ? money(sum(items)) : ""}
              </p>
              <div className="flex flex-col gap-2 bg-gray-50 border border-gray-200 rounded-[12px] p-2 min-h-[120px]">
                {items.length === 0 ? <Empty>—</Empty> : items.map((d) => (
                  <DealCard key={d.id} deal={d} onChange={(p) => update(d.id, p)} onDelete={() => remove(d.id)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
