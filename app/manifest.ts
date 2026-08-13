import type { MetadataRoute } from "next";

/* -------------------------------------------------------------------------- */
/*  TrendMart — PWA Web App Manifest                                          */
/*  Next.js auto-generates /manifest.webmanifest from this file and injects   */
/*  the <link rel="manifest"> tag automatically — no layout changes needed.   */
/*  Enables "Add to Home Screen" on Android/Chrome and standalone app mode.   */
/* -------------------------------------------------------------------------- */

const MARK = "/trendmart-mark.png?v=5";

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
    background_color: "#0f766e",
    theme_color: "#0f766e",
    categories: ["shopping", "business", "lifestyle"],
    icons: [
      {
        src: MARK,
        sizes: "505x562",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
