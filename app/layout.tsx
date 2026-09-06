import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import Footer from "@/components/Footer";
import PwaRegister from "@/components/PwaRegister";
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
    { media: "(prefers-color-scheme: light)", color: "#7a1f30" },
    { media: "(prefers-color-scheme: dark)", color: "#7a1f30" },
    { color: "#7a1f30" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* Apply theme + fontScale BEFORE first paint so header/UI don't jump big→small on refresh */
const THEME_BOOTSTRAP = `(function(){try{var k="trendsmart_theme_prefs_v4";var raw=localStorage.getItem(k);if(!raw){raw=localStorage.getItem("trendsmart_theme_prefs_v3");}var mode="light",fontScale=14,grid="grid",card="default";if(raw){var p=JSON.parse(raw);if(p){if(p.mode==="dark")mode="dark";else if(p.mode==="light")mode="light";else if(p.mode==="system")mode=(window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";if(typeof p.fontScale==="number"&&p.fontScale>=14&&p.fontScale<=20)fontScale=p.fontScale;if(["grid","compact","cards","list","gallery"].indexOf(p.gridLayout)>=0)grid=p.gridLayout;if(["default","minimal","detailed","service"].indexOf(p.cardStyle)>=0)card=p.cardStyle;}}var r=document.documentElement;if(mode==="dark"){r.classList.add("dark");r.classList.remove("light");}else{r.classList.add("light");r.classList.remove("dark");}var textPct=(fontScale/16)*100;var density=0.92+((fontScale-14)/6)*0.14;r.style.fontSize=textPct+"%";r.style.setProperty("--font-scale",String(fontScale));r.style.setProperty("--tm-ui-density",density.toFixed(3));r.setAttribute("data-font-scale",String(fontScale));r.classList.remove("layout-grid","layout-compact","layout-cards","layout-list","layout-gallery");r.classList.add("layout-"+grid);r.classList.remove("card-default","card-minimal","card-detailed","card-service");r.classList.add("card-"+card);var brands=["maroon-plum","green","blue","dark-purple","purple-pink","red","maroon-pink","maroon","bright-maroon","royal-maroon","plum-magenta","maroon-gold","maroon-teal","purple-blue"];var bt=localStorage.getItem("trendsmart_brand_theme_v1");var legacy={pink:"purple-pink",grey:"maroon-plum",orange:"red",yellow:"green","blue-green":"blue"};if(brands.indexOf(bt)<0&&bt&&legacy[bt])bt=legacy[bt];r.setAttribute("data-brand-theme",brands.indexOf(bt)>=0?bt:"maroon-plum");}catch(e){var r=document.documentElement;r.classList.add("light");r.classList.remove("dark");r.style.fontSize="87.5%";r.setAttribute("data-font-scale","14");r.classList.add("layout-grid","card-default");r.setAttribute("data-brand-theme","maroon-plum");}})();`;

/* Instant cover BEFORE first paint.
 * - First-ever homepage open (session flag unset): maroon-plum cover + lock until
 *   AppSplash takes over and plays the intro. The inline brand plate is painted
 *   only here and removed by AppSplash.releaseSplashBackground() when the intro
 *   finishes, so no brand-colored residue ever stays behind the app surface.
 * - Refresh / returning visit: show NOTHING (no cover, no logo flash) — the
 *   intro must only appear on a fresh open, never on every refresh. */
const SPLASH_BOOTSTRAP = `(function(){try{var r=document.documentElement;var p=location.pathname||"/";var home=p==="/"||p==="";var full=home&&sessionStorage.getItem("tm_splash_seen_v6")!=="1";if(full){r.style.backgroundColor="var(--tm-splash-bg)";r.classList.add("tm-boot-splash","tm-splash-lock");}}catch(e){}})();`;

const SITE_JSON_LD = generateSiteJsonLd();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-brand-theme="maroon-plum"
      className={`light ${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        <meta name="theme-color" content="#7a1f30" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
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
          {/* Brand-plate instant cover — the React splash pops the logo in once */}
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
