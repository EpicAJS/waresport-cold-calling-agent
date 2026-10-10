"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Inbox, Megaphone, Users, KanbanSquare, CalendarCheck, Phone, Send,
  BarChart3, UsersRound, Settings, LogOut, Sun, Moon, Monitor, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarStyle, initials, ROLE_LABEL } from "@/lib/ui";
import { useShell } from "@/components/shell-context";

type NavItem = { href: string; label: string; icon: React.ElementType; badge?: "unread" };

const WORKSPACE: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/inbox", label: "AI Inbox", icon: Inbox, badge: "unread" },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/demos", label: "Demos", icon: CalendarCheck },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/emails", label: "Outbox", icon: Send },
];

const ADMIN: NavItem[] = [
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/team", label: "Team", icon: UsersRound },
];

type Theme = "system" | "dark" | "light";

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try { setTheme((localStorage.getItem("ws-theme") as Theme) || "system"); } catch {}
  }, []);
  const next = () => {
    const order: Theme[] = ["system", "dark", "light"];
    const t = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(t);
    try { localStorage.setItem("ws-theme", t); } catch {}
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button onClick={next} title={`Theme: ${theme}`} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100">
      <Icon className="w-4 h-4" />
    </button>
  );
}

export default function Sidebar({ user }: { user: { name: string; email: string; role: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useShell();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const renderItem = ({ href, label, icon: Icon, badge }: NavItem) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "flex items-center gap-2 px-4 py-[7px] border-l-2 text-[13px] transition-colors",
          active ? "text-blue-500 bg-blue-50 border-blue-500 font-medium" : "text-gray-500 border-transparent hover:text-gray-900 hover:bg-blue-50"
        )}
      >
        <Icon className="w-[15px] h-[15px] opacity-80" />
        {label}
        {badge === "unread" && data.unread > 0 && (
          <span className="ml-auto text-[10px] font-semibold bg-red-500 text-white rounded-full px-1.5 min-w-[18px] text-center">{data.unread}</span>
        )}
      </Link>
    );
  };

  return (
    <aside className="w-[220px] min-w-[220px] bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0 overflow-y-auto">
      <div className="px-4 pt-5 pb-5 border-b border-gray-200 mb-3">
        <p className="text-[15px] font-semibold text-gray-900 tracking-tight">Waresport</p>
        <p className="text-[11px] font-medium text-blue-500">Outreach platform</p>
      </div>

      <p className="eyebrow px-4 pt-2 pb-1">Workspace</p>
      <nav className="flex flex-col">{WORKSPACE.map(renderItem)}</nav>

      <p className="eyebrow px-4 pt-4 pb-1">{user.role === "admin" ? "Admin" : "Account"}</p>
      <nav className="flex flex-col">
        {user.role === "admin" && ADMIN.map(renderItem)}
        {renderItem({ href: "/settings", label: "Settings", icon: Settings })}
      </nav>

      <div className="mt-auto p-4 border-t border-gray-200 space-y-3">
        <div>
          <p className="eyebrow mb-2">Connected inboxes</p>
          <div className="flex flex-col gap-1.5">
            {data.mailboxes.length === 0 && (
              <Link href="/settings#inboxes" className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-dashed border-gray-300 text-[11px] text-gray-500 hover:text-gray-900">
                <Plus className="w-3.5 h-3.5" />Connect Gmail or Outlook
              </Link>
            )}
            {data.mailboxes.map((m) => (
              <div key={m.id} title={`${m.email} · ${m.ownerName} · ${m.status}`} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50 border border-gray-200">
                <span className={cn("w-[22px] h-[22px] rounded-full text-[9px] font-semibold flex items-center justify-center shrink-0", avatarStyle(m.email))}>
                  {initials(m.email.split("@")[0])}
                </span>
                <span className="text-[11px] text-gray-500 flex-1 truncate">{m.email}</span>
                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", m.status === "active" ? "bg-green-500" : m.status === "error" ? "bg-amber-500" : "bg-gray-400")} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <span className={cn("w-7 h-7 rounded-full text-[11px] font-semibold flex items-center justify-center shrink-0", avatarStyle(user.email))}>
            {initials(user.name)}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-800 truncate">{user.name}</p>
            <p className="text-[10px] text-gray-400 truncate">{ROLE_LABEL[user.role] ?? user.role}</p>
          </div>
          <ThemeToggle />
          <button onClick={logout} title="Sign out" className="p-1.5 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
