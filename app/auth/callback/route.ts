import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles the email confirmation / magic-link callback from Supabase Auth.
 * After confirming the user, redirects to the dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Don't default to /dashboard — detect role and redirect accordingly
  const next = searchParams.get("next") ?? null;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Determine where to redirect based on user role
      let redirectTo = next ?? "/account";

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // SECURITY: never derive a role from user-editable user_metadata.role
          // — a signup could self-grant "merchant" (or attempt admin). Resolve
          // exclusively from the authoritative user_roles table, which the
          // handle_new_user trigger populates with a default "customer".
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();

          if (roleData?.role === "admin") redirectTo = "/admin/dashboard";
          else if (roleData?.role === "merchant") redirectTo = "/dashboard";
          else redirectTo = next ?? "/account";
        }
      } catch {
        // Fallback to customer portal if role detection fails
        redirectTo = next ?? "/account";
      }

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${redirectTo}`);
      }

      if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${redirectTo}`);
      }

      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // Fallback: redirect to login page with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}