"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

const links: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Overview", icon: "sparkles" },
  { href: "/admin/analytics", label: "Analytics", icon: "signal" },
  { href: "/admin/drones", label: "Drones", icon: "signal" },
  { href: "/admin/footage", label: "Footage", icon: "camera" },
  { href: "/admin/testimonials", label: "Testimonials", icon: "star" },
  { href: "/admin/orders", label: "Orders", icon: "cart" },
  { href: "/admin/enquiries", label: "Enquiries", icon: "whatsapp" },
  { href: "/admin/settings", label: "Settings", icon: "shield" },
];

export function AdminNav({ newEnquiries = 0, newOrders = 0 }: { newEnquiries?: number; newOrders?: number }) {
  const pathname = usePathname();
  return (
    <nav className="px-3 pb-4" aria-label="Admin">
      <ul className="space-y-1">
        {links.map((l) => {
          const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  active ? "bg-sunset text-night" : "text-white/75 hover:bg-white/10"
                }`}
              >
                <Icon name={l.icon} size={18} />
                {l.label}
                {l.href === "/admin/orders" && newOrders > 0 && (
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                      active ? "bg-night text-sunset" : "bg-sunset text-night"
                    }`}
                  >
                    {newOrders}
                  </span>
                )}
                {l.href === "/admin/enquiries" && newEnquiries > 0 && (
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                      active ? "bg-night text-sunset" : "bg-sunset text-night"
                    }`}
                  >
                    {newEnquiries}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
