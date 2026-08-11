/**
 * One-time / idempotent super-admin bootstrap.
 *
 * Usage (never commit real passwords):
 *   set ADMIN_BOOTSTRAP_EMAIL=you@example.com
 *   set ADMIN_BOOTSTRAP_PASSWORD=your-strong-password
 *   node scripts/ensure-super-admin.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvFile(name) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || "";

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!email || !password || password.length < 8) {
  console.error(
    "Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD (min 8 chars) in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(target) {
  // Paginate lightly — fine for small projects
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === target);
    if (hit) return hit;
    if (!data.users.length || data.users.length < 200) return null;
    page += 1;
    if (page > 20) return null;
  }
}

const existing = await findUserByEmail(email);
let userId = existing?.id;

if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "admin" },
  });
  if (error) {
    console.error("createUser failed:", error.message);
    process.exit(1);
  }
  userId = data.user.id;
  console.log("Created user", email);
} else {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: { ...(existing.user_metadata || {}), role: "admin" },
  });
  if (error) {
    console.error("updateUser failed:", error.message);
    process.exit(1);
  }
  console.log("Updated existing user", email);
}

const { error: roleError } = await admin.from("user_roles").upsert(
  { user_id: userId, role: "admin" },
  { onConflict: "user_id" },
);

if (roleError) {
  console.error("user_roles upsert failed:", roleError.message);
  console.error(
    "You can still run SQL: UPDATE public.user_roles SET role = 'admin' WHERE user_id = '" +
      userId +
      "';",
  );
  process.exit(1);
}

console.log("Super-admin ready:", email, "→ /admin/dashboard");
console.log("Do not commit ADMIN_BOOTSTRAP_PASSWORD. Rotate if it was shared in chat.");
