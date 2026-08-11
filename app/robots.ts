import type { MetadataRoute } from "next";

/* ────────────────────────────────────────────────────────────────────────── */
/*  TrendMart — Optimized robots.txt                                          */
/*                                                                             */
/*  Ensures maximum search engine visibility for:                              */
/*   - All active multi-vendor store pages                                    */
/*   - Category archives                                                      */
/*   - Feature product listings                                               */
/*   - Public utility pages (search, wishlist, addresses)                     */
/*                                                                             */
/*  Blocks crawlers from:                                                      */
/*   - Private dashboard & admin routes                                       */
/*   - Authentication pages                                                   */
/*   - Supabase/API internal endpoints                                        */
/*   - Static assets that don't need indexing                                 */
/* ────────────────────────────────────────────────────────────────────────── */

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://trendmart.vercel.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/dashboard/*",
          "/auth/",
          "/auth/*",
          "/admin/",
          "/admin/*",
          "/api/",
          "/api/*",
          "/orders/",
          "/orders/*",
          "/account/",
          "/account/*",
          "/settings/",
          "/settings/*",
          "/login",
          "/signup",
          "/forgot-password",
          "/_next/",
          "/cdn-cgi/",
        ],
      },
      // Additional rule for AI crawlers (optional opt-out)
      {
        userAgent: "GPTBot",
        disallow: "/",
      },
      {
        userAgent: "CCBot",
        disallow: "/",
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}