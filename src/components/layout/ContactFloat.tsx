"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { site, buildWhatsappHref } from "@/lib/site";
import { Icon } from "@/components/ui/Icon";

/** Floating contact buttons — a compact, inline row (Call + WhatsApp) pinned to
 *  the bottom-right. Hides while the hero section is on screen so it doesn't
 *  clutter the cinematic first impression. */
export function ContactFloat({
  whatsapp = site.whatsapp,
  whatsappMessage = site.whatsappMessage,
  phone = site.phone,
}: {
  whatsapp?: string;
  whatsappMessage?: string;
  phone?: string;
}) {
  const [inHero, setInHero] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const hero = document.getElementById("hero");
      setInHero(Boolean(hero && hero.getBoundingClientRect().bottom > window.innerHeight * 0.5));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pathname]);

  const telHref = `tel:${phone.replace(/[^0-9+]/g, "")}`;

  return (
    <div
      aria-hidden={inHero}
      style={{
        opacity: inHero ? 0 : 1,
        transform: inHero ? "translateY(0.75rem)" : "translateY(0)",
        pointerEvents: inHero ? "none" : "auto",
      }}
      className="safe-bottom fixed right-4 z-40 flex items-center gap-2 transition-all duration-300"
    >
      <a
        href={telHref}
        aria-label={`Call ${site.brand}`}
        tabIndex={inHero ? -1 : 0}
        className="flex items-center gap-1.5 rounded-full bg-ocean px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-black/25 transition hover:scale-105"
      >
        <Icon name="phone" size={16} />
        <span className="hidden sm:inline">Call us</span>
      </a>
      <a
        href={buildWhatsappHref(whatsapp, whatsappMessage)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Message ${site.brand} on WhatsApp`}
        tabIndex={inHero ? -1 : 0}
        className="flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-black/25 transition hover:scale-105"
      >
        <Icon name="whatsapp" size={16} />
        <span className="hidden sm:inline">Chat with us</span>
      </a>
    </div>
  );
}
