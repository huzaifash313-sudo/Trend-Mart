/**
 * Approve pending shops and confirm emails for users who already signed up.
 * Usage: node scripts/approve-existing-signups.mjs
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

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function approvePendingShops() {
  const res = await fetch(
    `${url}/rest/v1/shops?verification_status=eq.pending`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ verification_status: "approved", is_live: true }),
    },
  );
  if (!res.ok) {
    throw new Error(`approve shops failed (${res.status}): ${await res.text()}`);
  }
  const rows = await res.json();
  console.log(`Approved ${Array.isArray(rows) ? rows.length : 0} pending shop(s).`);
}

async function confirmUnverifiedUsers() {
  let confirmed = 0;
  for (let page = 1; page <= 20; page += 1) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers,
    });
    if (!res.ok) {
      throw new Error(`listUsers failed (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    const users = data.users ?? [];
    for (const user of users) {
      if (user.email_confirmed_at) continue;
      const upd = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ email_confirm: true }),
      });
      if (!upd.ok) {
        console.warn(`Could not confirm ${user.email}: ${upd.status} ${await upd.text()}`);
        continue;
      }
      confirmed += 1;
    }
    if (users.length < 200) break;
  }
  console.log(`Confirmed ${confirmed} previously unverified account(s).`);
}

async function main() {
  await approvePendingShops();
  await confirmUnverifiedUsers();
  console.log("✅ Existing signups approved / emails confirmed.");
}

main().catch((err) => {
  console.error("Approve existing failed:", err.message ?? err);
  process.exit(1);
});
