import type { MetadataRoute } from "next";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — PWA Web App Manifest                                          */
/*  Square teal-plate icons (mark contain, no stretch) for home-screen.       */
/* -------------------------------------------------------------------------- */

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TrendsMart — Local Shopping, Instant WhatsApp Orders",
    short_name: "TrendsMart",
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
        src: "/icon-192.png?v=10",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=10",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=10",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
