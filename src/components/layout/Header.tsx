"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { nav, site } from "@/lib/site";
import { Icon } from "@/components/ui/Icon";
import { CartButton } from "@/components/shop/CartButton";
import { BookButton } from "@/components/booking/BookingDialog";

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState({ pathname, open: false });
  const open = menu.open;
  if (menu.pathname !== pathname) setMenu({ pathname, open: false });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`safe-top safe-x fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || open ? "bg-night/90 backdrop-blur-md shadow-lg shadow-black/20" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-white" aria-label={`${site.brand} home`}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-sunset text-night">
            <Icon name="play" size={18} />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            dronevideography<span className="text-sunset">.lk</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex lg:gap-8" aria-label="Primary">
          {nav.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium transition-colors ${
                  active ? "text-sunset" : "text-white/80 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <CartButton />
          <BookButton
            className="inline-flex items-center gap-2 rounded-full bg-sunset px-5 py-2.5 text-sm font-semibold text-night transition hover:bg-amber-400"
          >
            <Icon name="whatsapp" size={18} /> Book Now
          </BookButton>
        </nav>

        <div className="flex items-center gap-1 md:hidden">
          <CartButton />
          <button
            type="button"
            onClick={() => setMenu({ pathname, open: !open })}
            className="grid h-10 w-10 place-items-center rounded-lg text-white md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            <Icon name={open ? "close" : "menu"} size={24} />
          </button>
        </div>
      </div>

      {open && (
        <nav className="safe-pb border-t border-white/10 bg-night/95 px-5 py-4 md:hidden" aria-label="Mobile">
          <ul className="flex flex-col gap-1">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-lg px-3 py-3 text-white/90 hover:bg-white/5"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="mt-2">
              <BookButton
                onClick={() => setMenu({ pathname, open: false })}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-sunset px-5 py-3 font-semibold text-night"
              >
                <Icon name="whatsapp" size={18} /> Book a drone video
              </BookButton>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
