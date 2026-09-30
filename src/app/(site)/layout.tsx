import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ContactFloat } from "@/components/layout/ContactFloat";
import { localBusinessJsonLd, JsonLd } from "@/lib/seo";
import { getSettings } from "@/lib/db";
import { CartProvider } from "@/components/shop/CartProvider";
import { BookingProvider } from "@/components/booking/BookingDialog";
import { AnalyticsConsent } from "@/components/analytics/AnalyticsConsent";
import { analyticsPublicPages } from "@/lib/analytics-public-pages";
import { GA4_DESTINATION } from "@/lib/ga4-destination";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return (
    <CartProvider>
      <BookingProvider whatsapp={settings.whatsapp}>
        <JsonLd data={localBusinessJsonLd()} />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer settings={settings} />
        {process.env.GA4_COLLECTION_ENABLED === "true" && (
          <AnalyticsConsent measurementId={GA4_DESTINATION.measurementId} pages={analyticsPublicPages} />
        )}
        <ContactFloat
          whatsapp={settings.whatsapp}
          whatsappMessage={settings.whatsappMessage}
          phone={settings.phone}
        />
      </BookingProvider>
    </CartProvider>
  );
}
