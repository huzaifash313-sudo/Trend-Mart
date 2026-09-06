import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trends Mart — Local Shopping, Instant WhatsApp Orders",
    short_name: "Trends Mart",
    description:
      "Discover live local shops on trendsmart.pk. Browse products, deals, and place orders directly via WhatsApp.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f766e",
    theme_color: "#0f766e",
    categories: ["shopping", "business", "lifestyle"],
    icons: [
      {
        src: "/icon-192.png?v=16",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=16",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=16",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
