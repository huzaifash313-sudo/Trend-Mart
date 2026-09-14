import { writeFileSync } from "fs";
import { listCatalogSeedRows } from "../lib/categoryCatalog";

function esc(s: string) {
  return String(s).replace(/'/g, "''");
}

const rows = listCatalogSeedRows();
const cats = [...new Set(rows.map((r) => r.category))];
const lines: string[] = [];

lines.push("-- TrendsMart: polish category catalog (Cafe, Meat, expanded subs)");
lines.push("-- Safe to re-run: ON CONFLICT DO UPDATE");
lines.push("BEGIN;");
lines.push("");
lines.push("DO $$");
lines.push("DECLARE cat record;");
lines.push("BEGIN");
lines.push("  FOR cat IN");
lines.push("    SELECT DISTINCT category AS category_name FROM (VALUES");
lines.push(cats.map((c) => `      ('${esc(c)}')`).join(",\n"));
lines.push("    ) AS t(category)");
lines.push("  LOOP");
lines.push(
  "    INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others)",
);
lines.push("    VALUES (");
lines.push("      cat.category_name,");
lines.push("      'Others / General',");
lines.push(
  "      lower(regexp_replace(cat.category_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-others',",
);
lines.push(
  "      'Items that do not fit specific sub-categories within ' || cat.category_name,",
);
lines.push("      '📦', 999, true");
lines.push("    )");
lines.push("    ON CONFLICT (category, slug) DO NOTHING;");
lines.push("  END LOOP;");
lines.push("END $$;");
lines.push("");

for (const r of rows) {
  if (r.is_others) continue;
  lines.push(
    "INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES",
  );
  lines.push(
    `  ('${esc(r.category)}', '${esc(r.name)}', '${esc(r.slug)}', '${esc(r.description)}', '${esc(r.icon)}', ${r.sort_order}, false)`,
  );
  lines.push("ON CONFLICT (category, slug) DO UPDATE SET");
  lines.push("  name = EXCLUDED.name,");
  lines.push("  description = EXCLUDED.description,");
  lines.push("  icon = EXCLUDED.icon,");
  lines.push("  sort_order = EXCLUDED.sort_order,");
  lines.push("  is_active = true,");
  lines.push("  updated_at = now();");
  lines.push("");
}

lines.push("COMMIT;");

writeFileSync(
  "supabase/migrations/20260321_polish_category_catalog.sql",
  lines.join("\n"),
  "utf8",
);
console.log(
  `Wrote ${rows.filter((r) => !r.is_others).length} subs across ${cats.length} categories`,
);
