import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function AdminOnlyLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/dashboard");
  return children;
}
