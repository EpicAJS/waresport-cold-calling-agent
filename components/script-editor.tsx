"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { inputCls } from "@/lib/labels";

export const DEFAULT_SCRIPT = `You are a friendly AI assistant calling on behalf of Waresport. Waresport helps sports clubs manage player registrations, scheduling, and payments in one platform, saving clubs 15 to 20 hours a week on admin work.

Ask to speak with whoever manages the club's operations. Introduce yourself briefly, explain the value in one sentence, and ask how they currently handle registrations and payments.

Your goal is to get them to agree to a quick 15-minute demo.

If they are busy: ask for a better time to call back.
If they already use another tool: ask what they like and don't like about it, and mention that clubs often switch to save time on payment reminders and renewals.
If they ask for information: offer to email it along with a link to book a demo.
If they are not interested: thank them for their time and end the call politely.

If asked, be honest that you are an AI assistant.`;

export default function ScriptEditor({ value, onChange, brief }: { value: string; onChange: (v: string) => void; brief?: string }) {
  const [prompt, setPrompt] = useState(brief ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (improve: boolean) => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "script", brief: prompt, current: improve ? value : "" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "AI request failed.");
    onChange(data.script);
  };

  return (
    <div className="space-y-3">
      <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 space-y-2">
        <p className="text-xs font-medium text-purple-800 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />AI script writer</p>
        <textarea
          className={`${inputCls} h-16 resize-none bg-white`}
          placeholder="Describe who you're calling and what you're offering, e.g. 'Youth soccer clubs in Texas, pitch our registration + payments platform, mention the free trial'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="flex gap-2">
          <button type="button" onClick={() => generate(false)} disabled={busy || !prompt.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}Write new script
          </button>
          <button type="button" onClick={() => generate(true)} disabled={busy || !value.trim()}
            className="px-3 py-1.5 text-xs border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-100 disabled:opacity-50">
            Improve current script
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <textarea className={`${inputCls} h-72 resize-y font-mono text-xs leading-relaxed`} value={value} onChange={(e) => onChange(e.target.value)} />
      <p className="text-xs text-gray-400">
        A follow-up protocol is always added to the end of this script: the agent asks for their email and best phone number,
        tells them a booking link is coming, and honors do-not-call requests.
      </p>
    </div>
  );
}
