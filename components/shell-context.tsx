"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ShellMailbox = {
  id: string;
  email: string;
  provider: "google" | "microsoft";
  status: "active" | "error" | "disconnected";
  lastSyncAt: string | null;
  ownerName: string;
};

export type ShellData = {
  mailboxes: ShellMailbox[];
  unread: number;
  threads: number;
  lastScanAt: string | null;
  aiEnabled: boolean;
};

const EMPTY: ShellData = { mailboxes: [], unread: 0, threads: 0, lastScanAt: null, aiEnabled: false };

const ShellContext = createContext<{ data: ShellData; refresh: () => void }>({ data: EMPTY, refresh: () => {} });

export function useShell() {
  return useContext(ShellContext);
}

const SHELL_POLL_MS = 30_000;
const SYNC_TICK_MS = 60_000;

/** Polls shell data and, while the app is open, nudges the server to scan inboxes and send due emails. */
export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ShellData>(EMPTY);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/shell", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      await fetch("/api/sync/tick", { method: "POST" }).catch(() => null);
      refresh();
    };
    refresh();
    tick();
    const a = setInterval(refresh, SHELL_POLL_MS);
    const b = setInterval(tick, SYNC_TICK_MS);
    return () => { clearInterval(a); clearInterval(b); };
  }, [refresh]);

  return <ShellContext.Provider value={{ data, refresh }}>{children}</ShellContext.Provider>;
}
