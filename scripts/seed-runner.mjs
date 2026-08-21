import { readFileSync } from "node:fs";

// Load seed credentials from .env.local (the seed script reads SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY, but the project stores the URL as NEXT_PUBLIC_*).
const env = readFileSync(`${process.cwd()}/.env.local`, "utf8");
const get = (key) => env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? "";

process.env.SUPABASE_URL = get("NEXT_PUBLIC_SUPABASE_URL");
process.env.SUPABASE_SERVICE_ROLE_KEY = get("SUPABASE_SERVICE_ROLE_KEY");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

await import("./seed-marketplace.mjs");