import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicAppUrl } from "@/lib/appUrl";

/**
 * Handles the email confirmation / magic-link callback from Supabase Auth.
 * After confirming the user, redirects to the dashboard.
 */
/**
 * Validate a user-supplied `next` redirect path.
 * Only internal, absolute paths are allowed. Blocks scheme-relative (`//`),
 * absolute URLs, and control characters — preventing open-redirect attacks.
 */
function sanitizeRedirectPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return null;
  return trimmed;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  // SECURITY: `next` is user-controlled — never redirect to it raw.
  const safeNext = sanitizeRedirectPath(searchParams.get("next"));
  // Prefer the official public origin so callbacks never land on *.vercel.app.
  const origin = getPublicAppUrl();

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Determine where to redirect based on user role
      let redirectTo = safeNext ?? "/account";

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
          else redirectTo = safeNext ?? "/account";
        }
      } catch {
        // Fallback to customer portal if role detection fails
        redirectTo = safeNext ?? "/account";
      }

      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // Fallback: redirect to login page with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
