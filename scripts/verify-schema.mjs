#!/usr/bin/env node
/**
 * Schema drift gate.
 *
 * Asserts every table/column in scripts/schema-manifest.json actually exists in
 * the target Supabase database, so a deploy can't ship code that expects a
 * column the DB doesn't have. (That exact drift once made product search return
 * zero results in production while every page still returned HTTP 200 — the
 * failure was silent, which is why this runs as a gate.)
 *
 * Usage:  node scripts/verify-schema.mjs
 * Needs:  NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *         (exits 0 with a notice when unset, so local/PR runs aren't blocked)
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log(
    "⏭️  verify-schema: Supabase credentials not configured — skipping schema check.",
  );
  process.exit(0);
}

const manifest = JSON.parse(
  readFileSync(join(__dirname, "schema-manifest.json"), "utf8"),
);

const base = url.replace(/\/+$/, "");
const missing = [];
const unreachable = [];

/**
 * PostgREST returns 400 with "column ... does not exist" when a selected column
 * is unknown, and 404 when the table itself is missing. limit=0 keeps it cheap —
 * we only care about the schema, never the rows.
 */
async function checkTable(table, columns) {
  const endpoint = `${base}/rest/v1/${table}?select=${columns.join(",")}&limit=0`;
  let res;
  try {
    res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
  } catch (err) {
    unreachable.push(`${table} (network: ${err.message})`);
    return;
  }

  if (res.ok) return;

  const body = await res.text().catch(() => "");

  if (res.status === 404 || /relation .* does not exist/i.test(body)) {
    missing.push(`${table} — TABLE MISSING`);
    return;
  }

  // Pull the specific column name out of the PostgREST error when present.
  const named = body.match(/column "?([\w.]+)"? does not exist/i);
  if (named) {
    missing.push(`${table}.${named[1].replace(`${table}.`, "")}`);
    return;
  }

  // Column listed in the manifest but absent from the schema cache.
  const cached = body.match(/Could not find the '([^']+)' column/i);
  if (cached) {
    missing.push(`${table}.${cached[1]}`);
    return;
  }

  unreachable.push(`${table} (HTTP ${res.status}: ${body.slice(0, 160)})`);
}

const entries = Object.entries(manifest.tables ?? {});
console.log(`🔎 verify-schema: checking ${entries.length} tables against ${base}`);

await Promise.all(entries.map(([table, columns]) => checkTable(table, columns)));

if (unreachable.length > 0) {
  console.warn("⚠️  Could not verify:");
  for (const u of unreachable) console.warn(`   • ${u}`);
}

if (missing.length > 0) {
  console.error("\n❌ Schema drift — the database is missing:");
  for (const m of missing) console.error(`   • ${m}`);
  console.error(
    "\nApply the pending migrations in supabase/migrations/ before deploying.\n",
  );
  process.exit(1);
}

// A gate that couldn't actually check anything must not report success — that
// would be the same silent green this script exists to prevent.
if (unreachable.length === entries.length) {
  console.error(
    "\n❌ verify-schema: no table could be verified (auth/network). Refusing to pass.\n",
  );
  process.exit(1);
}

if (unreachable.length > 0) {
  console.log(
    `✅ verify-schema: ${entries.length - unreachable.length}/${entries.length} tables match the manifest (see warnings above).`,
  );
} else {
  console.log("✅ verify-schema: database matches the manifest.");
}
