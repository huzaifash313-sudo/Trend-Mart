import type { MetadataRoute } from "next";

/* -------------------------------------------------------------------------- */
/*  TrendMart — PWA Web App Manifest                                          */
/*  Icons: same source mark (exact file) — no redesign / recompress.          */
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
    background_color: "#0f766e",
    theme_color: "#0f766e",
    categories: ["shopping", "business", "lifestyle"],
    icons: [
      {
        src: "/trendmart-mark.png?v=6",
        sizes: "505x562",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png?v=6",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=6",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=6",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
