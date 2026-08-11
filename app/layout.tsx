import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import Footer from "@/components/Footer";
import PwaRegister from "@/components/PwaRegister";
import CartBar from "@/components/CartBar";
import CartProvider from "@/context/CartContext";
import { LocationProvider } from "@/context/LocationContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { MerchantQuickAddProvider } from "@/context/MerchantQuickAddContext";
import { ToastProvider } from "@/components/Toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MerchantQuickAddModal from "@/components/MerchantQuickAddModal";
import AppNotifications from "@/components/AppNotifications";
import type { ReactNode } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrendMart — Local Shopping, Instant WhatsApp Orders",
  description:
    "Discover live local shops, browse products, and place orders directly via WhatsApp. TrendMart connects you with nearby merchants in real time.",
  keywords: [
    "TrendMart",
    "local shopping",
    "WhatsApp ordering",
    "e-commerce Pakistan",
    "online store",
  ],
  openGraph: {
    title: "TrendMart — Local Shopping, Instant WhatsApp Orders",
    description:
      "Discover live local shops, browse products, and order via WhatsApp.",
    type: "website",
    siteName: "TrendMart",
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TrendMart",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "512x512", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
};

const THEME_BOOTSTRAP = `(function(){try{var k="trendmart_theme_prefs_v4";var raw=localStorage.getItem(k);if(!raw){raw=localStorage.getItem("trendmart_theme_prefs_v3");}var mode="light";if(raw){var p=JSON.parse(raw);if(p&&p.mode==="dark")mode="dark";}var r=document.documentElement;if(mode==="dark"){r.classList.add("dark");r.classList.remove("light");}else{r.classList.add("light");r.classList.remove("dark");}}catch(e){document.documentElement.classList.add("light");document.documentElement.classList.remove("dark");}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`light ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="tm-bg flex min-h-full flex-col">
        <ThemeProvider>
        <CartProvider>
          <LocationProvider>
            <ToastProvider>
              <MerchantQuickAddProvider>
              <AppNotifications>
              <ErrorBoundary name="Navbar">
                <Navbar />
              </ErrorBoundary>
              <ErrorBoundary name="MainContent">
                <main className="flex-1">{children}</main>
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
              <MerchantQuickAddModal />
              <PwaRegister />
              </AppNotifications>
              </MerchantQuickAddProvider>
            </ToastProvider>
          </LocationProvider>
        </CartProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}