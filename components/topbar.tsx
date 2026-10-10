"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useShell } from "@/components/shell-context";
import { timeAgo } from "@/lib/ui";

export default function Topbar() {
  const { data } = useShell();
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const active = data.mailboxes.filter((m) => m.status === "active").length;
  const live = active > 0;

  return (
    <header className="sticky top-0 z-10 h-[52px] bg-white border-b border-gray-200 px-6 flex items-center gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className={live ? "ai-pulse" : "ai-pulse idle"} />
        <span className="text-xs font-semibold text-blue-500 whitespace-nowrap">
          {live ? (data.aiEnabled ? "AI scanning live" : "Scanning live · rules mode") : "No inboxes connected"}
        </span>
        <span className="text-xs text-gray-500 truncate">
          {live
            ? `Monitoring ${active} inbox${active === 1 ? "" : "es"} · ${data.threads.toLocaleString()} threads tracked · last scan ${timeAgo(data.lastScanAt)}`
            : "Connect Gmail or Outlook in Settings to start tracking replies"}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {!data.aiEnabled && (
          <span className="chip chip-warn hidden lg:inline-block" title="Set OPENAI_API_KEY to turn on AI classification and drafts">
            AI key not set
          </span>
        )}
        <Link href="/campaigns/new" className="btn-primary"><Plus className="w-3.5 h-3.5" />New campaign</Link>
      </div>
    </header>
  );
}
