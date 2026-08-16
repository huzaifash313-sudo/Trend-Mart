import type { NextConfig } from "next";
import { auditEnvironmentVariables, formatAuditReport } from "./lib/envAudit";

// ── Environment Variable Security Audit (runs at build time) ─────────────
// PROMPT 5: Ensures no private keys or secrets are exposed to the client
// bundle via NEXT_PUBLIC_* prefix. Fails the build in production if
// secrets are detected in public variables.
if (typeof window === "undefined") {
  try {
    const auditResult = auditEnvironmentVariables(true);
    if (process.env.NODE_ENV === "production" && !auditResult.passed) {
      console.error(formatAuditReport(auditResult));
      if (auditResult.exposedSecretCount > 0) {
        throw new Error(
          `❌ Build aborted: ${auditResult.exposedSecretCount} secret(s) detected in NEXT_PUBLIC_* variables. ` +
          `Review the audit report above and remove NEXT_PUBLIC_ prefix from secret variables.`,
        );
      }
    } else if (auditResult.warnings.length > 0) {
      console.warn(formatAuditReport(auditResult));
    } else {
      console.info(formatAuditReport(auditResult));
    }
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      throw err;
    }
    console.warn("[envAudit] Audit skipped (non-critical in dev):", (err as Error).message);
  }
}

const isProd = process.env.NODE_ENV === "production";
const isCI = process.env.CI === "true";

const nextConfig: NextConfig = {
  // ── Environment Variables (explicitly inline NEXT_PUBLIC_* for client) ────
  // SECURITY: no hardcoded fallbacks here. A hardcoded Supabase URL/anon key
  // would silently target a fixed project whenever env vars are missing —
  // masking misconfiguration. The client/server now fail fast instead.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  },

  // ── Allowed Dev Origins (network access via LAN IP) ─────────────────────────
  allowedDevOrigins: ["192.168.2.14", "localhost"],

  // ── Production Optimisation ────────────────────────────────────────────────
  reactStrictMode: true,
  poweredByHeader: false, // Remove X-Powered-By to avoid version disclosure

  // ── Output Configuration ──────────────────────────────────────────────────
  // Do NOT set `output: "standalone"` for Vercel. On Vercel, the platform
  // adapter skips generating `.next/next-server.js.nft.json`, and standalone
  // mode then crashes with ENOENT when writeStandaloneDirectory tries to
  // read that file. Use standalone only for Docker/self-host via env flag.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "true" && !process.env.VERCEL
    ? { output: "standalone" as const }
    : {}),

  // ── Compression ────────────────────────────────────────────────────────────
  // Next.js auto-compresses responses with gzip/brotli. Ensure it's enabled.
  compress: true,

  // ── Image Configuration ────────────────────────────────────────────────────
  images: {
    // Restrict remote patterns to known sources instead of wildcard
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "**.supabase.in",
      },
    ],
    // Aggressive caching for optimized images
    formats: ["image/avif", "image/webp"],
    // Minimum cache TTL for optimized images (1 hour in production)
    minimumCacheTTL: isProd ? 3600 : 60,
    // Leaner breakpoints = fewer image variants generated / cached
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [32, 48, 64, 96, 128, 256],
    // Content disposition for SEO-friendly image URLs
    contentDispositionType: "inline",
  },

  // ── Compiler Options ───────────────────────────────────────────────────────
  compiler: {
    // Remove console.log statements in production (keep error/warn for debugging)
    removeConsole: isProd ? { exclude: ["error", "warn"] } : false,
  },

  // ── Webpack Bundle Optimization ────────────────────────────────────────────
  webpack(config, { isServer, dev }) {
    // ── Tree-shaking & Dead Code Elimination ─────────────────────────────
    if (!dev && !isServer) {
      // Split large chunks: separate Supabase client from main bundle
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        chunks: "all",
        cacheGroups: {
          // Separate Supabase into its own chunk (lazy-loads for non-auth pages)
          supabase: {
            test: /[\\/]node_modules[\\/](@supabase)[\\/]/,
            name: "supabase-vendor",
            priority: 20,
            chunks: "all",
            reuseExistingChunk: true,
          },
          // Separate Framer Motion into its own chunk
          framer: {
            test: /[\\/]node_modules[\\/](framer-motion)[\\/]/,
            name: "framer-vendor",
            priority: 15,
            chunks: "all",
            reuseExistingChunk: true,
          },
          // Separate jsPDF into its own chunk (heavy PDF generation lib)
          jspdf: {
            test: /[\\/]node_modules[\\/](jspdf)[\\/]/,
            name: "jspdf-vendor",
            priority: 14,
            chunks: "all",
            reuseExistingChunk: true,
          },
          // Shared UI utilities
          shared: {
            test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            name: "react-core",
            priority: 10,
            chunks: "all",
            reuseExistingChunk: true,
          },
          // Common application code across pages
          common: {
            name: "common-app",
            minChunks: 2,
            priority: 5,
            reuseExistingChunk: true,
          },
        },
        // Smaller max initial chunk size to encourage splitting
        maxInitialRequests: 25,
        minSize: 20000,
      };

      // Enable deterministic module IDs for better long-term caching
      config.optimization.moduleIds = "deterministic";
      config.optimization.chunkIds = "deterministic";

      // Aggressive minimizer settings for production
      if (isProd) {
        config.optimization.minimize = true;
      }
    }

    // ── Bundle Analyzer support (opt-in via ANALYZE=true env var) ────────
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (process.env.ANALYZE === "true") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: "static",
          reportFilename: isServer
            ? "../../analyze/server.html"
            : "../analyze/client.html",
          openAnalyzer: false,
        }),
      );
    }

    return config;
  },

  // ── Additional HTTP Headers ────────────────────────────────────────────────
  // Applied by Next.js server to ALL responses, including static assets and API
  // routes that may not go through the middleware matcher.
  async headers() {
    return [
      // ── Global Security Headers ─────────────────────────────────────────
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "unsafe-none" },
          // Content Security Policy (CSP)
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              isProd
                ? "script-src 'self' 'unsafe-inline'"
                : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              isProd
                ? "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://nominatim.openstreetmap.org"
                : "connect-src 'self' ws: wss: https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://nominatim.openstreetmap.org",
              "frame-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              ...(isProd ? ["upgrade-insecure-requests" as const] : []),
            ].join("; "),
          },
        ],
      },

      // ── Immutable Static Assets (JS/CSS with content hashes) ────────────
      // Only in production — in dev mode this breaks HMR hot reloading
      ...(isProd
        ? [
            {
              source: "/_next/static/(.*)",
              headers: [
                {
                  key: "Cache-Control",
                  value: "public, max-age=31536000, immutable",
                },
              ],
            },
          ]
        : []),

      // ── Font Files ──────────────────────────────────────────────────────
      // Aggressive caching for font files (they rarely change)
      {
        source: "/fonts/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },

      // ── Public Assets (images, favicons, manifests) ──────────────────────
      {
        source: "/images/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: isProd
              ? "public, max-age=86400, stale-while-revalidate=604800"
              : "no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/(favicon\\.ico|manifest\\.json|robots\\.txt|sitemap\\.xml)",
        headers: [
          {
            key: "Cache-Control",
            value: isProd
              ? "public, max-age=3600, must-revalidate"
              : "no-store, must-revalidate",
          },
        ],
      },

      // ── Route Segment Caching for High-Traffic Catalog Pages ─────────────
      // /shop/[id] pages are pre-rendered and can be cached at CDN edge
      {
        source: "/shop/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: isProd
              ? "public, max-age=300, s-maxage=600, stale-while-revalidate=86400"
              : "no-store, must-revalidate",
          },
        ],
      },
      // /search pages benefit from short-lived caching
      {
        source: "/search(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: isProd
              ? "public, max-age=60, s-maxage=300, stale-while-revalidate=86400"
              : "no-store, must-revalidate",
          },
        ],
      },
      // Landing page is relatively static
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: isProd
              ? "public, max-age=120, s-maxage=600, stale-while-revalidate=86400"
              : "no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/products(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: isProd
              ? "public, max-age=60, s-maxage=300, stale-while-revalidate=86400"
              : "no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/deals(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: isProd
              ? "public, max-age=60, s-maxage=300, stale-while-revalidate=86400"
              : "no-store, must-revalidate",
          },
        ],
      },

      // ── API Route Headers ────────────────────────────────────────────────
      {
        source: "/api/(.*)",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },

      // ── Admin Routes (no caching) ────────────────────────────────────────
      {
        source: "/admin/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/dashboard/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },

      // ── Auth Routes (no caching) ─────────────────────────────────────────
      {
        source: "/auth/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/login/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/signup/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
    ];
  },

  // ── Additional Redirects / Rewrites (production safety) ────────────────────
  async redirects() {
    return [
      // Ensure trailing-slash consistency (remove trailing slashes)
      {
        source: "/:path+/",
        destination: "/:path",
        permanent: true,
      },
    ];
  },

  // ── Experimental Features ───────────────────────────────────────────────────
  // Keep this lean for Vercel: avoid optimizeCss / adapter-conflicting flags.
  experimental: {
    optimizePackageImports: [
      "@supabase/supabase-js",
      "@supabase/ssr",
      "framer-motion",
    ],
    serverActions: {
      bodySizeLimit: "2mb",
      allowedOrigins: isProd
        ? ["trendmart.vercel.app", "trendmart.com"]
        : ["localhost:3000"],
    },
  },

  // ── Build-Time Configuration ────────────────────────────────────────────────
  generateEtags: true,

  // Next.js 16 defaults to Turbopack. A custom `webpack()` without any
  // `turbopack` key aborts the Vercel build. An empty config opts in and
  // keeps webpack available when you explicitly run `next build --webpack`.
  turbopack: {},

  // ── Environment-specific overrides ──────────────────────────────────────────
  ...(!isProd && {
    logging: {
      fetches: {
        fullUrl: true,
      },
    },
  }),

  // Fail the build on TypeScript errors in production / CI.
  // Note: `eslint` is no longer a valid next.config key in Next.js 16 —
  // lint via `npm run lint` / the ESLint CLI instead.
  ...((isProd || isCI) && {
    typescript: {
      ignoreBuildErrors: false,
    },
  }),
};

export default nextConfig;