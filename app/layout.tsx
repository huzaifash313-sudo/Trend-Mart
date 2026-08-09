import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import Footer from "@/components/Footer";
import PwaRegister from "@/components/PwaRegister";
import CartBar from "@/components/CartBar";
import CartProvider from "@/context/CartContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { LocationProvider } from "@/context/LocationContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/components/Toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="tm-bg flex min-h-full flex-col">
        <ThemeProvider>
        <LanguageProvider>
        <CartProvider>
          <LocationProvider>
            <ToastProvider>
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
              <PwaRegister />
            </ToastProvider>
          </LocationProvider>
        </CartProvider>
        </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}