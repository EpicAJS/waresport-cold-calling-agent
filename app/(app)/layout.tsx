import { redirect } from "next/navigation";
import Sidebar from "@/components/sidebar";
import Topbar from "@/components/topbar";
import { ShellProvider } from "@/components/shell-context";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <ShellProvider>
      <div className="flex h-screen bg-base">
        <Sidebar user={user} />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </ShellProvider>
  );
}
