import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import Footer from "@/components/Footer";
import PwaRegister from "@/components/PwaRegister";
import AppSplash from "@/components/AppSplash";
import ChunkReloadGuard from "@/components/ChunkReloadGuard";
import InteractionUnlock from "@/components/InteractionUnlock";
import AccountScopeGuard from "@/components/AccountScopeGuard";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import CartBar from "@/components/CartBar";
import CartProvider from "@/context/CartContext";
import QueryProvider from "@/components/QueryProvider";
import { LocationProvider } from "@/context/LocationContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { MerchantQuickAddProvider } from "@/context/MerchantQuickAddContext";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import AppNotifications from "@/components/AppNotifications";
import MerchantQuickAddHost from "@/components/MerchantQuickAddHost";
import OnboardingWizard from "@/components/OnboardingWizard";
import ScrollToTop from "@/components/ScrollToTop";
import { ScrollToTopSuspense } from "@/components/PageLoadingShell";
import { generateRootMetadata, generateSiteJsonLd } from "@/lib/metadata";
import type { ReactNode } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
});

export const metadata: Metadata = generateRootMetadata();

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f766e" },
    { media: "(prefers-color-scheme: dark)", color: "#0f766e" },
    { color: "#0f766e" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* Apply theme + fontScale BEFORE first paint so header/UI don't jump big→small on refresh */
const THEME_BOOTSTRAP = `(function(){try{var k="trendmart_theme_prefs_v4";var raw=localStorage.getItem(k);if(!raw){raw=localStorage.getItem("trendmart_theme_prefs_v3");}var mode="light",fontScale=14,grid="grid",card="default";if(raw){var p=JSON.parse(raw);if(p){if(p.mode==="dark")mode="dark";else if(p.mode==="light")mode="light";if(typeof p.fontScale==="number"&&p.fontScale>=14&&p.fontScale<=20)fontScale=p.fontScale;if(["grid","compact","cards","list","gallery"].indexOf(p.gridLayout)>=0)grid=p.gridLayout;if(["default","minimal","detailed","service"].indexOf(p.cardStyle)>=0)card=p.cardStyle;}}var r=document.documentElement;if(mode==="dark"){r.classList.add("dark");r.classList.remove("light");}else{r.classList.add("light");r.classList.remove("dark");}var textPct=(fontScale/16)*100;var density=0.92+((fontScale-14)/6)*0.14;r.style.fontSize=textPct+"%";r.style.setProperty("--font-scale",String(fontScale));r.style.setProperty("--tm-ui-density",density.toFixed(3));r.setAttribute("data-font-scale",String(fontScale));r.classList.remove("layout-grid","layout-compact","layout-cards","layout-list","layout-gallery");r.classList.add("layout-"+grid);r.classList.remove("card-default","card-minimal","card-detailed","card-service");r.classList.add("card-"+card);}catch(e){var r=document.documentElement;r.classList.add("light");r.classList.remove("dark");r.style.fontSize="87.5%";r.setAttribute("data-font-scale","14");r.classList.add("layout-grid","card-default");}})();`;

/* Instant cover BEFORE first paint.
 * - First-ever homepage open (session flag unset): teal cover + lock until
 *   AppSplash takes over and plays the intro.
 * - Refresh / returning visit: show NOTHING (no cover, no logo flash) — the
 *   intro must only appear on a fresh open, never on every refresh. */
const SPLASH_BOOTSTRAP = `(function(){try{var r=document.documentElement;r.style.backgroundColor="#0f766e";var p=location.pathname||"/";var home=p==="/"||p==="";var full=home&&sessionStorage.getItem("tm_splash_seen_v6")!=="1";if(full){r.classList.add("tm-boot-splash","tm-splash-lock");}}catch(e){}})();`;

const SITE_JSON_LD = generateSiteJsonLd();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`light ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ backgroundColor: "#0f766e" }}
    >
      <head>
        <meta name="theme-color" content="#0f766e" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <script dangerouslySetInnerHTML={{ __html: SPLASH_BOOTSTRAP }} />
        {SITE_JSON_LD.map((block, i) => (
          <script
            // eslint-disable-next-line react/no-array-index-key
            key={`ld-${i}`}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
          />
        ))}
      </head>
      <body className="tm-bg flex min-h-full flex-col">
        <div id="tm-boot-splash" className="tm-boot-splash" aria-hidden="true">
          <div className="tm-boot-splash-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/trendmart-mark.png?v=8" alt="" width={88} height={88} />
          </div>
        </div>
        <QueryProvider>
        <ThemeProvider>
        <CartProvider>
          <LocationProvider>
            <ToastProvider>
              <ConfirmProvider>
              <MerchantQuickAddProvider>
              <AppNotifications>
              <ErrorBoundary name="AppSplash">
                <AppSplash />
              </ErrorBoundary>
              <ChunkReloadGuard />
              <InteractionUnlock />
              <AccountScopeGuard />
              <ErrorBoundary name="Navbar">
                <Navbar />
              </ErrorBoundary>
              <ScrollToTopSuspense>
                <ScrollToTop />
              </ScrollToTopSuspense>
              <RouteErrorBoundary name="MainContent">
                <main className="tm-main tm-route-fade flex-1">{children}</main>
              </RouteErrorBoundary>
              <ErrorBoundary name="Footer">
                <Footer />
              </ErrorBoundary>
              <ErrorBoundary name="BottomNav">
                <BottomNav />
              </ErrorBoundary>
              <ErrorBoundary name="CartBar">
                <CartBar />
              </ErrorBoundary>
              <MerchantQuickAddHost />
              <OnboardingWizard />
              <PwaRegister />
              </AppNotifications>
              </MerchantQuickAddProvider>
              </ConfirmProvider>
            </ToastProvider>
          </LocationProvider>
        </CartProvider>
        </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
