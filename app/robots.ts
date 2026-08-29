import type { MetadataRoute } from "next";

/* ────────────────────────────────────────────────────────────────────────── */
/*  TrendMart — Optimized robots.txt (AI-Assistant Friendly)                  */
/*                                                                             */
/*  SEO strategy: maximum discoverability across BOTH classic search engines  */
/*  (Google / Bing / Yandex) AND AI assistants / answer engines (ChatGPT,     */
/*  Claude, Perplexity, Bing Copilot, Google AI Overviews, etc.).              */
/*                                                                             */
/*  AI crawlers are deliberately ALLOWED to index the public marketplace:      */
/*  when someone asks an assistant "best burger deals near Peoples Colony,     */
/*  Gujranwala", the assistant can read shop/product pages and cite TrendMart  */
/*  with a link. Security is preserved because only public storefront routes   */
/*  are crawlable — private areas stay disallowed for every agent.             */
/*                                                                             */
/*  Blocks ALL crawlers from:                                                  */
/*   - Private dashboard & admin routes                                       */
/*   - Authentication pages                                                   */
/*   - Supabase/API internal endpoints                                        */
/*   - Static assets that don't need indexing                                 */
/* ────────────────────────────────────────────────────────────────────────── */

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://trend-marts.vercel.app";

  // Private areas — never crawlable by any agent.
  const PRIVATE_PATHS = [
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
  ];

  return {
    rules: [
      // ── General crawlers (Google, Bing, DuckDuckGo, etc.) ──────────────
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      // ── AI assistant / answer-engine crawlers ──────────────────────────
      // OpenAI GPTBot / OAI-SearchBot: powers ChatGPT answers + citations.
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      // Anthropic Claude: powers Claude.ai web citations.
      {
        userAgent: "ClaudeBot",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "anthropic-ai",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      // Perplexity answer engine.
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      // Google AI Overviews / Vertex AI crawlers.
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "Google-CloudVertexBot",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      // Bing Copilot / Microsoft AI crawlers.
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "MicrosoftCopilot",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "Meta-ExternalAgent",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      // Common content-scraping AI crawlers — allow with the same boundaries.
      {
        userAgent: "CCBot",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "Bytespider",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "cohere-ai",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "Amazonbot",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "Applebot-Extended",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
