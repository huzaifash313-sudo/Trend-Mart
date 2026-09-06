import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import Footer from "@/components/Footer";
import PwaRegister from "@/components/PwaRegister";
import ConnectionStatus from "@/components/ConnectionStatus";
import AppSplash from "@/components/AppSplash";
import ChunkReloadGuard from "@/components/ChunkReloadGuard";
import NavigationRecovery from "@/components/NavigationRecovery";
import InteractionUnlock from "@/components/InteractionUnlock";
import AccountScopeGuard from "@/components/AccountScopeGuard";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import CartBar from "@/components/CartBar";
import CartProvider from "@/context/CartContext";
import QueryProvider from "@/components/QueryProvider";
import { LocationProvider } from "@/context/LocationContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { MerchantQuickAddProvider } from "@/context/MerchantQuickAddContext";
import { ShopReviewsProvider } from "@/context/ShopReviewsContext";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import AppNotifications from "@/components/AppNotifications";
import MerchantQuickAddHost from "@/components/MerchantQuickAddHost";
import PolicyNotice from "@/components/PolicyNotice";
import ScrollToTop from "@/components/ScrollToTop";
import TurnstileScript from "@/components/TurnstileScript";
import DeferredAppChrome from "@/components/DeferredAppChrome";
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

/* Display face for headings / brand / prices — a single premium font keeps
   the marketplace hierarchy consistent while Geist carries body + UI text. */
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
  adjustFontFallback: true,
});

/* Soft optical serif for shop names — heavy, professional, and distinctive
   against the sans UI so store brands (e.g. Tandoori Express) feel premium. */
const fraunces = Fraunces({
  variable: "--font-shop",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
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
const THEME_BOOTSTRAP = `(function(){try{var k="trendsmart_theme_prefs_v4";var raw=localStorage.getItem(k);if(!raw){raw=localStorage.getItem("trendsmart_theme_prefs_v3");}var mode="light",fontScale=14,grid="grid",card="default";if(raw){var p=JSON.parse(raw);if(p){if(p.mode==="dark")mode="dark";else if(p.mode==="light")mode="light";else if(p.mode==="system")mode=(window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";if(typeof p.fontScale==="number"&&p.fontScale>=14&&p.fontScale<=20)fontScale=p.fontScale;if(["grid","compact","cards","list","gallery"].indexOf(p.gridLayout)>=0)grid=p.gridLayout;if(["default","minimal","detailed","service"].indexOf(p.cardStyle)>=0)card=p.cardStyle;}}var r=document.documentElement;if(mode==="dark"){r.classList.add("dark");r.classList.remove("light");}else{r.classList.add("light");r.classList.remove("dark");}var textPct=(fontScale/16)*100;var density=0.92+((fontScale-14)/6)*0.14;r.style.fontSize=textPct+"%";r.style.setProperty("--font-scale",String(fontScale));r.style.setProperty("--tm-ui-density",density.toFixed(3));r.setAttribute("data-font-scale",String(fontScale));r.classList.remove("layout-grid","layout-compact","layout-cards","layout-list","layout-gallery");r.classList.add("layout-"+grid);r.classList.remove("card-default","card-minimal","card-detailed","card-service");r.classList.add("card-"+card);var brands=["green","blue","dark-purple","purple-pink","red","maroon-pink","purple-blue"];var bt=localStorage.getItem("trendsmart_brand_theme_v1");var legacy={pink:"purple-pink",grey:"green",orange:"red",yellow:"green","blue-green":"blue"};if(brands.indexOf(bt)<0&&bt&&legacy[bt])bt=legacy[bt];r.setAttribute("data-brand-theme",brands.indexOf(bt)>=0?bt:"green");}catch(e){var r=document.documentElement;r.classList.add("light");r.classList.remove("dark");r.style.fontSize="87.5%";r.setAttribute("data-font-scale","14");r.classList.add("layout-grid","card-default");r.setAttribute("data-brand-theme","green");}})();`;

/* Instant cover BEFORE first paint.
 * Shows whenever we want the brand intro to play:
 *  - Standalone PWA launches (every cold open from the home-screen icon —
 *    WhatsApp-style, the intro is part of the "app open" feel even when the
 *    OS kept the session alive). Detected via display-mode/media + iOS.
 *  - A fresh browser session landing on "/" (session flag unset).
 * Refresh / in-session visits keep showing nothing so browsing is never
 * interrupted by the cover. The inline teal is painted only here and removed
 * by AppSplash.releaseSplashBackground() when the intro finishes.
 *
 * The background is set as `var(--tm-splash-bg, #0f766e)` — a literal teal
 * fallback so the root canvas is branded even on the very first frame, before
 * globals.css (and its CSS custom properties) has finished loading. Without
 * this the browser could flash an unpainted black/white window between the
 * native splash and the boot cover on slow devices. */
const SPLASH_CRITICAL_CSS = `
#tm-boot-splash{display:none}
html.tm-boot-splash{background-color:#0f766e}
html.tm-boot-splash #tm-boot-splash{display:flex;position:fixed;inset:0;z-index:13002;align-items:center;justify-content:center;background:radial-gradient(120% 80% at 50% -10%,rgba(94,234,212,.35),transparent 55%),radial-gradient(90% 70% at 100% 100%,rgba(13,148,136,.55),transparent 50%),linear-gradient(165deg,#0f766e 0%,#0d9488 42%,#115e59 100%);pointer-events:none}
#tm-boot-splash .tm-boot-logo{display:inline-flex;height:5.5rem;width:5.5rem;align-items:center;justify-content:center;border-radius:1.25rem;background:#fff;box-shadow:0 12px 36px rgba(0,0,0,.22),0 0 0 1px rgba(255,255,255,.4);padding:.55rem}
#tm-boot-splash .tm-boot-logo img{display:block;width:100%;height:100%;object-fit:contain}
`;

const SPLASH_BOOTSTRAP = `(function(){try{var r=document.documentElement;var p=location.pathname||"/";var home=p==="/"||p==="";var st=function(){try{return (window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches)||(window.matchMedia&&window.matchMedia("(display-mode: fullscreen)").matches)||navigator.standalone===true;}catch(e){return false;}}();var full=home&&(st||sessionStorage.getItem("tm_splash_seen_v6")!=="1");if(full){r.style.setProperty("background-color","var(--tm-splash-bg, #0f766e)");r.classList.add("tm-boot-splash","tm-splash-lock");}}catch(e){}})();`;

const SITE_JSON_LD = generateSiteJsonLd();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-brand-theme="green"
      className={`light ${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        <meta name="theme-color" content="#0f766e" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Trends Mart" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=16" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=16" />
        {/* Logo must be cached before the boot cover paints — the splash logo
            tile appears instantly, no empty white box waiting on the image. */}
        <link rel="preload" as="image" href="/trendsmart-mark.png?v=16" />
        <link rel="preload" as="image" href="/trendmart-mark.png?v=16" />
        {/* Critical splash CSS is inlined (not a <link>) so the branded boot
            cover paints on the very first frame — it never waits on the main
            stylesheet, which kills the black/blank gap on slow Android. The
            same rules exist in globals.css for the app itself. */}
        <style
          dangerouslySetInnerHTML={{ __html: SPLASH_CRITICAL_CSS }}
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <script dangerouslySetInnerHTML={{ __html: SPLASH_BOOTSTRAP }} />
        {SITE_JSON_LD.map((block, i) => (
          <script
            key={`ld-${i}`}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
          />
        ))}
      </head>
      <body className="tm-bg flex min-h-full flex-col">
        <div id="tm-boot-splash" className="tm-boot-splash" aria-hidden="true">
          {/* Instant branded cover — teal stage + logo tile so a cold PWA
              launch is never an empty colour. The React splash takes over
              with the same tile and animates it up into the wordmark. */}
          <div className="tm-boot-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/trendsmart-mark.png?v=16"
              alt=""
              width={72}
              height={72}
              decoding="async"
            />
          </div>
        </div>
        <QueryProvider>
        <ThemeProvider>
        <CartProvider>
          <LocationProvider>
            <ToastProvider>
              <ConfirmProvider>
              <MerchantQuickAddProvider>
              <ShopReviewsProvider>
              <AppNotifications>
              <ErrorBoundary name="AppSplash" autoResetMs={2500}>
                <AppSplash />
              </ErrorBoundary>
              <ChunkReloadGuard />
              <NavigationRecovery />
              <InteractionUnlock />
              <AccountScopeGuard />
              <ErrorBoundary name="Navbar" autoResetMs={2500}>
                <Navbar />
              </ErrorBoundary>
              <ScrollToTopSuspense>
                <ScrollToTop />
              </ScrollToTopSuspense>
              <RouteErrorBoundary name="MainContent" autoResetMs={1500}>
                <main className="tm-main tm-route-fade flex-1">{children}</main>
              </RouteErrorBoundary>
              <ErrorBoundary name="Footer" autoResetMs={2500}>
                <Footer />
              </ErrorBoundary>
              <ErrorBoundary name="BottomNav" autoResetMs={2500}>
                <BottomNav />
              </ErrorBoundary>
              <ErrorBoundary name="CartBar" autoResetMs={2500}>
                <CartBar />
              </ErrorBoundary>
              <ErrorBoundary name="DeferredChrome" autoResetMs={2500}>
                <DeferredAppChrome />
              </ErrorBoundary>
              <MerchantQuickAddHost />
              <PolicyNotice />
              <ConnectionStatus />
              <PwaRegister />
              <TurnstileScript />
              </AppNotifications>
              </ShopReviewsProvider>
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
