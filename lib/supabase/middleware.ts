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
      `[TrendMart Middleware] Missing required configuration (${key}). ` +
      `Please complete the platform setup.`,
    );
  }
  return value;
}

export interface RefreshedSessionUser {
  id: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
}

export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: RefreshedSessionUser | null;
}> {
  let supabaseResponse = NextResponse.next({ request });
  let sessionUser: RefreshedSessionUser | null = null;

  // Fast path: no auth cookies means a guest with nothing to refresh — skip
  // the Supabase getUser() call entirely (saves an edge round-trip per page).
  const hasAuthCookie = request.cookies.getAll().some(
    (c) => c.name.startsWith("sb-") && c.value.length > 0,
  );
  if (hasAuthCookie) {
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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      sessionUser = {
        id: user.id,
        email_confirmed_at: user.email_confirmed_at,
        user_metadata: user.user_metadata ?? null,
        app_metadata: user.app_metadata ?? null,
      };
    }
  }

  return { response: supabaseResponse, user: sessionUser };
}
