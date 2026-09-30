import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { logoutAction } from "@/app/admin/actions";
import { getEnquiries, getOrders } from "@/lib/db";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminAnalytics } from "@/components/admin/AnalyticsDashboard";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const enquiries = await getEnquiries();
  const newCount = enquiries.filter((e) => e.status === "new").length;
  const newOrders = (await getOrders()).filter((o) => o.status === "new").length;

  return (
    <div className="min-h-screen bg-cream md:grid md:grid-cols-[250px_1fr]">
      <aside className="border-b border-night/10 bg-night text-white md:border-b-0 md:border-r md:border-white/10">
        <div className="flex items-center justify-between p-5">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-sunset text-night">
              <Icon name="play" size={16} />
            </span>
            <span className="font-display font-semibold">Admin</span>
          </Link>
          <Link href="/" target="_blank" className="text-xs text-white/50 hover:text-sunset">
            View site ↗
          </Link>
        </div>
        <AdminNav newEnquiries={newCount} newOrders={newOrders} />
        <form action={logoutAction} className="p-4">
          <button
            type="submit"
            className="w-full rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white/80 transition hover:bg-white/10"
          >
            Sign out
          </button>
        </form>
      </aside>

      <main className="min-w-0 p-5 sm:p-8"><AdminAnalytics>{children}</AdminAnalytics></main>
    </div>
  );
}
