import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import Footer from "@/components/Footer";
import PwaRegister from "@/components/PwaRegister";
import AppSplash from "@/components/AppSplash";
import ChunkReloadGuard from "@/components/ChunkReloadGuard";
import CartBar from "@/components/CartBar";
import CartProvider from "@/context/CartContext";
import QueryProvider from "@/components/QueryProvider";
import { LocationProvider } from "@/context/LocationContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { MerchantQuickAddProvider } from "@/context/MerchantQuickAddContext";
import { ToastProvider } from "@/components/Toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import AppNotifications from "@/components/AppNotifications";
import MerchantQuickAddHost from "@/components/MerchantQuickAddHost";
import ScrollToTop from "@/components/ScrollToTop";
import { ScrollToTopSuspense } from "@/components/PageLoadingShell";
import { generateRootMetadata, generateSiteJsonLd } from "@/lib/metadata";
import type { ReactNode } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = generateRootMetadata();

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const THEME_BOOTSTRAP = `(function(){try{var k="trendmart_theme_prefs_v4";var raw=localStorage.getItem(k);if(!raw){raw=localStorage.getItem("trendmart_theme_prefs_v3");}var mode="light";if(raw){var p=JSON.parse(raw);if(p&&p.mode==="dark")mode="dark";}var r=document.documentElement;if(mode==="dark"){r.classList.add("dark");r.classList.remove("light");}else{r.classList.add("light");r.classList.remove("dark");}}catch(e){document.documentElement.classList.add("light");document.documentElement.classList.remove("dark");}})();`;

/* Show teal+logo cover before React so homepage never flashes first */
const SPLASH_BOOTSTRAP = `(function(){try{var p=location.pathname||"/";if(p!=="/"&&p!=="")return;if(sessionStorage.getItem("tm_splash_seen_v5")==="1")return;document.documentElement.classList.add("tm-boot-splash","tm-splash-lock");}catch(e){document.documentElement.classList.add("tm-boot-splash","tm-splash-lock");}})();`;

const SITE_JSON_LD = generateSiteJsonLd();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`light ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
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
              <MerchantQuickAddProvider>
              <AppNotifications>
              <ErrorBoundary name="AppSplash">
                <AppSplash />
              </ErrorBoundary>
              <ChunkReloadGuard />
              <ErrorBoundary name="Navbar">
                <Navbar />
              </ErrorBoundary>
              <ScrollToTopSuspense>
                <ScrollToTop />
              </ScrollToTopSuspense>
              <ErrorBoundary name="MainContent">
                <main className="tm-main flex-1">{children}</main>
              </ErrorBoundary>
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
              <PwaRegister />
              </AppNotifications>
              </MerchantQuickAddProvider>
            </ToastProvider>
          </LocationProvider>
        </CartProvider>
        </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
