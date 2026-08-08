import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Validate that a required environment variable is present.
 * Returns the value or throws with a clear diagnostic message.
 * In the middleware edge runtime, missing env vars would otherwise
 * cause silently broken Supabase clients that hang requests.
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `[TrendMart Middleware] Missing required environment variable: ${key}. ` +
      `Ensure it is set in your deployment environment (Vercel dashboard or .env.local).`,
    );
  }
  return value;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session — important! Do not remove.
  await supabase.auth.getUser();

  return supabaseResponse;
}
