import type { CapacitorConfig } from "@capacitor/cli";

// Remote-URL wrapper ("Tareeqa 1"): the Android app is a thin native shell that
// always loads the live hosted site — same Supabase DB, same API routes, no
// bundled web build to keep in sync. Update NEXT_PUBLIC_APP_URL, not this file,
// when the production domain changes.
//
// appId is a placeholder — changing it after the first Play Store upload is
// disruptive (it's the app's permanent package name), so confirm it before
// publishing.
const config: CapacitorConfig = {
  appId: "com.trendmart.app",
  appName: "TrendMart",
  webDir: "public",
  server: {
    url: process.env.NEXT_PUBLIC_APP_URL || "https://trend-marts.vercel.app",
    androidScheme: "https",
    cleartext: false,
  },
};

export default config;
