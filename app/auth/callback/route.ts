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
          const metaRole = (user.user_metadata?.role as string | undefined) ?? "";
          const desiredRole =
            metaRole === "merchant" || metaRole === "customer" ? metaRole : "customer";

          // Ensure role row exists after email-link confirmation
          try {
            await supabase.rpc("set_my_signup_role", { desired_role: desiredRole });
          } catch {
            await supabase.from("user_roles").upsert(
              { user_id: user.id, role: desiredRole },
              { onConflict: "user_id" },
            );
          }

          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();

          if (roleData?.role === "admin") redirectTo = "/admin/dashboard";
          else if (roleData?.role === "merchant" || metaRole === "merchant") redirectTo = "/dashboard";
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