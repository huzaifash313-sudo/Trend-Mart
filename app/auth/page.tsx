import { redirect } from "next/navigation";

/**
 * Legacy auth page — immediately redirects to the new /login page.
 *
 * Server-side redirect (no hydration mismatch) preserves backward
 * compatibility for any existing links pointing to /auth while the
 * new split-screen UI lives at /login and /signup.
 */
export default function AuthRedirectPage() {
  redirect("/login");
}