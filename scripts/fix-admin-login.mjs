/**
 * TrendsMart — Admin Login Fixer (one-shot)
 * ---------------------------------------------------------------------------
 * WHY:  Merchants/customers sign in fine, but the SUPER ADMIN login returns
 *       401/error. This forces the admin account into a known-good state and
 *       then PROVES it by performing a real password sign-in.
 *
 * WORKS FOR PRODUCTION TOO: local `.env.local` and the deployed app point to
 * the SAME Supabase project, so running this locally fixes trendsmart.pk.
 *
 * USAGE:
 *   node scripts/fix-admin-login.mjs                                  → uses defaults
 *   node scripts/fix-admin-login.mjs you@email.com "YourPass@123"    → set your own
 *
 * WHAT IT DOES
 *   1. Finds the user (or creates it) via the auth Admin API.
 *   2. Resets the password, confirms the email, forces app_metadata.role = admin.
 *   3. Upserts public.user_roles = 'admin'  (RLS is_admin() checks pass).
 *   4. Upserts public.user_profiles so the admin panel shows a name.
 *   5. Runs a REAL password-grant sign-in and prints LOGIN OK / FAILED.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const email = (process.argv[2] ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? "admin@trendsmart.pk").trim().toLowerCase();
const password = process.argv[3] ?? process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "Trend@123";
const fullName = "Super Admin";

const adminHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function findUser(targetEmail) {
  for (let page = 1; page <= 20; page += 1) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: adminHeaders });
    if (!res.ok) throw new Error(`listUsers failed (${res.status})`);
    const data = await res.json();
    const match = (data.users ?? []).find((u) => u.email?.toLowerCase() === targetEmail);
    if (match) return match;
    if ((data.users ?? []).length < 200) break;
  }
  return null;
}

async function main() {
  console.log(`\nFixing admin → ${email}\n`);

  let user = await findUser(email);

  if (user) {
    console.log(`User exists (${user.id}) — resetting password + admin role…`);
    const res = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({
        password,
        email_confirm: true,
        app_metadata: { provider: "email", providers: ["email"], role: "admin" },
        user_metadata: { full_name: fullName, role: "admin" },
      }),
    });
    if (!res.ok) throw new Error(`updateUser failed (${res.status}): ${await res.text()}`);
    user = await res.json();
  } else {
    console.log("User not found — creating new admin…");
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        app_metadata: { provider: "email", providers: ["email"], role: "admin" },
        user_metadata: { full_name: fullName, role: "admin" },
      }),
    });
    if (!res.ok) throw new Error(`createUser failed (${res.status}): ${await res.text()}`);
    user = await res.json();
  }

  // public.user_roles → admin (powers is_admin() RLS)
  const roleRes = await fetch(`${url}/rest/v1/user_roles?user_id=eq.${user.id}`, {
    method: "PATCH",
    headers: { ...adminHeaders, Prefer: "return=representation" },
    body: JSON.stringify({ role: "admin", updated_at: new Date().toISOString() }),
  });
  if (!roleRes.ok) {
    const ins = await fetch(`${url}/rest/v1/user_roles`, {
      method: "POST",
      headers: { ...adminHeaders, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ user_id: user.id, role: "admin" }),
    });
    if (!ins.ok && ins.status !== 409) throw new Error(`user_roles upsert failed (${ins.status}): ${await ins.text()}`);
  }

  // public.user_profiles
  const prof = await fetch(`${url}/rest/v1/user_profiles`, {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: user.id, full_name: fullName, phone: "", updated_at: new Date().toISOString() }),
  });
  if (!prof.ok && prof.status !== 409) throw new Error(`user_profiles upsert failed (${prof.status})`);

  // REAL sign-in proof (same call the /login page makes)
  const sign = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const d = await sign.json();
  if (!sign.ok || !d.access_token) {
    console.log(`\n❌ VERIFY LOGIN FAILED (${sign.status}): ${d.error_description || d.msg || "unknown"}`);
    console.log("Response:", JSON.stringify(d).slice(0, 300));
    process.exit(1);
  }

  const role = d.user?.app_metadata?.role ?? d.user?.user_metadata?.role ?? "?";
  console.log("\n✅ Super-Admin is READY and login VERIFIED");
  console.log("   Email:     " + email);
  console.log("   Password:  " + password);
  console.log("   Role:      " + role + "  (expect admin)");
  console.log("   Confirmed: " + !!d.user?.email_confirmed_at);
  console.log("\n   → Login at  /login  (trendsmart.pk/login)");
  console.log("   → Panel at  /admin/dashboard");
}

main().catch((err) => {
  console.error("Fix failed:", err.message ?? err);
  process.exit(1);
});
