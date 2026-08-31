/**
 * Create or promote the Super-Admin account from ADMIN_BOOTSTRAP_* env vars.
 * Usage: node scripts/bootstrap-admin.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? "admin@trendsmart.pk").trim().toLowerCase();
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "Trend@123";

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const adminHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function findUserByEmail(targetEmail) {
  for (let page = 1; page <= 20; page += 1) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: adminHeaders,
    });
    if (!res.ok) {
      throw new Error(`listUsers failed (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    const match = (data.users ?? []).find((u) => u.email?.toLowerCase() === targetEmail);
    if (match) return match;
    if ((data.users ?? []).length < 200) break;
  }
  return null;
}

async function promoteRole(userId) {
  const res = await fetch(`${url}/rest/v1/user_roles?user_id=eq.${userId}`, {
    method: "PATCH",
    headers: { ...adminHeaders, Prefer: "return=representation" },
    body: JSON.stringify({ role: "admin", updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const insert = await fetch(`${url}/rest/v1/user_roles`, {
      method: "POST",
      headers: { ...adminHeaders, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ user_id: userId, role: "admin" }),
    });
    if (!insert.ok) {
      throw new Error(`user_roles upsert failed (${insert.status}): ${await insert.text()}`);
    }
  }
}

async function upsertProfile(userId) {
  const res = await fetch(`${url}/rest/v1/user_profiles`, {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: userId,
      full_name: "TrendsMart Admin",
      phone: "",
      address: "",
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`user_profiles upsert failed (${res.status}): ${await res.text()}`);
  }
}

async function main() {
  console.log(`Bootstrapping Super-Admin: ${email}`);

  let user = await findUserByEmail(email);

  if (user) {
    console.log(`User already exists (${user.id}) — promoting to admin…`);
    const res = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({
        password,
        email_confirm: true,
        app_metadata: { ...(user.app_metadata ?? {}), role: "admin" },
        user_metadata: {
          ...(user.user_metadata ?? {}),
          full_name: "TrendsMart Admin",
          role: "admin",
        },
      }),
    });
    if (!res.ok) throw new Error(`updateUser failed (${res.status}): ${await res.text()}`);
    user = await res.json();
  } else {
    console.log("Creating new admin user…");
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        app_metadata: { provider: "email", providers: ["email"], role: "admin" },
        user_metadata: { full_name: "TrendsMart Admin", role: "admin" },
      }),
    });
    if (!res.ok) throw new Error(`createUser failed (${res.status}): ${await res.text()}`);
    user = await res.json();
  }

  await promoteRole(user.id);
  await upsertProfile(user.id);

  console.log("\n✅ Super-Admin ready");
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Login:    /login`);
  console.log(`   Panel:    /admin/dashboard`);
}

main().catch((err) => {
  console.error("Bootstrap failed:", err.message ?? err);
  process.exit(1);
});
