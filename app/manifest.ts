import type { MetadataRoute } from "next";

/* -------------------------------------------------------------------------- */
/*  TrendMart — PWA Web App Manifest                                          */
/*  Next.js auto-generates /manifest.webmanifest from this file and injects   */
/*  the <link rel="manifest"> tag automatically — no layout changes needed.   */
/*  Enables "Add to Home Screen" on Android/Chrome and standalone app mode.   */
/* -------------------------------------------------------------------------- */

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TrendMart — Local Shopping, Instant WhatsApp Orders",
    short_name: "TrendMart",
    description:
      "Discover live local shops, browse products, and place orders directly via WhatsApp.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#059669",
    categories: ["shopping", "business", "lifestyle"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
