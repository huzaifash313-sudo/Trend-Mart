import { readFileSync } from "node:fs";
import { resolve } from "node:path";
function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(key in process.env)) process.env[key] = v;
  }
}
loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase() || "admin@trendsmart.pk";
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || "Trend@123";

const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const d = await r.json();
if (!r.ok || !d.access_token) {
  console.log(`LOGIN FAILED (${r.status}): ${d.error_description || d.msg || d.error || "unknown"}`);
  console.log(JSON.stringify(d).slice(0, 400));
  process.exit(1);
}
console.log("LOGIN OK");
console.log("role:", d.user?.app_metadata?.role ?? d.user?.user_metadata?.role);
console.log("confirmed:", !!d.user?.email_confirmed_at);
