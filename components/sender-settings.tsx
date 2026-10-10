"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useShell } from "@/components/shell-context";
import { inputCls } from "@/lib/labels";

type Box = { id: string; email: string; provider: string; status: string; userId: string };

/** "Send from" inbox picker and AI personalization toggle for a campaign. */
export default function SenderSettings({ ownerId, mailboxId, onMailbox, aiPersonalize, onAiPersonalize, channel }: {
  ownerId?: string;
  mailboxId: string | null;
  onMailbox: (id: string | null) => void;
  aiPersonalize: boolean;
  onAiPersonalize: (v: boolean) => void;
  channel: "call" | "email";
}) {
  const { data: shell } = useShell();
  const [boxes, setBoxes] = useState<Box[] | null>(null);

  useEffect(() => {
    fetch(ownerId ? "/api/mailboxes" : "/api/mailboxes?mine=1").then((r) => r.json()).then((d) => {
      setBoxes((d.mailboxes as Box[]).filter((b) => b.status !== "disconnected" && (!ownerId || b.userId === ownerId)));
    }).catch(() => setBoxes([]));
  }, [ownerId]);

  return (
    <div className="grid grid-cols-2 gap-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">Send from</label>
        {boxes && boxes.length === 0 ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            No inbox connected. <Link href="/settings#inboxes" className="underline">Connect Gmail or Outlook</Link> so emails send from your own address and replies get tracked.
          </p>
        ) : (
          <select className={inputCls} value={mailboxId ?? ""} onChange={(e) => onMailbox(e.target.value || null)}>
            <option value="">{boxes?.[0] ? `Default (${boxes[0].email})` : "Default inbox"}</option>
            {boxes?.map((b) => <option key={b.id} value={b.id}>{b.email}{b.status === "error" ? " — needs reconnecting" : ""}</option>)}
          </select>
        )}
        <p className="text-[11px] text-gray-400 mt-1">{channel === "email" ? "Every email in the sequence" : "Follow-up emails after calls"} go out from this inbox; follow-ups thread under the first email.</p>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">AI personalization</label>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-0.5" checked={aiPersonalize} onChange={(e) => onAiPersonalize(e.target.checked)} />
          <span>
            Write a personal opening line for each club from its website and sport
            <span className="block text-[11px] text-gray-400 mt-0.5">
              <Sparkles className="w-3 h-3 inline mr-0.5" />Fills <code className="bg-white px-1 rounded">{"{{ai_opener}}"}</code> in your first email.
              {!shell.aiEnabled && " Needs the OpenAI key; until then the line is left out."}
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
