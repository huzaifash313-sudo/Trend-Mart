#!/usr/bin/env node
/** One-off rebrand: TrendsMart / TrendsMart → TrendsMart (never TrendsMart). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage"]);
const EXT = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".json", ".css", ".md", ".sql", ".txt",
  ".yml", ".yaml", ".html", ".example",
]);
const SKIP_FILES = new Set(["package-lock.json"]);

const REPLACEMENTS = [
  ["Trends Mart", "Trends Mart"],
  ["TrendsMart", "TrendsMart"],
  ["TrendsMart", "TrendsMart"],
  ["TRENDS_MART", "TRENDS_MART"],
  ["trendsmart:", "trendsmart:"],
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function apply(content) {
  let next = content;
  for (const [from, to] of REPLACEMENTS) {
    next = next.split(from).join(to);
  }
  return next;
}

let updated = 0;
for (const file of walk(ROOT)) {
  const base = path.basename(file);
  if (SKIP_FILES.has(base)) continue;
  if (base === ".cursorrules") {
    /* handled below via ext check fallback */
  }
  const ext = path.extname(file);
  if (!EXT.has(ext) && base !== ".cursorrules") continue;

  const original = fs.readFileSync(file, "utf8");
  const next = apply(original);
  if (next !== original) {
    fs.writeFileSync(file, next, "utf8");
    updated++;
  }
}

console.log(`Rebrand complete — updated ${updated} files.`);
