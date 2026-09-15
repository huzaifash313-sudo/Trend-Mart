"use client";

/* -------------------------------------------------------------------------- */
/*  CSV bulk-import: upload → parse → duplicate-aware preview → commit         */
/* -------------------------------------------------------------------------- */

import { useMemo, useRef, useState } from "react";
import type { ProductFormData } from "@/types";
import {
  getOthersSubCategoryId,
  type SubCategoryWithMeta,
} from "@/services/subCategoryService";
import { bulkCreateProducts, fetchProductsByShopId } from "@/services/productService";
import { isValidUUID, buildCSVDocument } from "@/lib/sanitization";

export interface ProductCsvImportDialogProps {
  shopId: string;
  shopCategory: string;
  subs: SubCategoryWithMeta[];
  onClose: () => void;
  onImported: (count: number) => void;
  onToast?: (message: string, variant?: "success" | "error" | "info") => void;
}

type RowStatus = "new" | "duplicate" | "error";

interface ImportRow {
  key: string;
  checked: boolean;
  status: RowStatus;
  error?: string;
  name: string;
  description: string;
  price: number;
  original_price: number | null;
  is_available: boolean;
  sub_category_id: string | null;
  subCategoryLabel: string;
}

const TEMPLATE_HEADERS = ["Name", "Sub-category", "Price", "Original Price", "Description", "Available"];

function downloadTemplate() {
  const csv = buildCSVDocument(TEMPLATE_HEADERS, [
    ["Sample Product", "Others", "500", "", "Optional description", "Yes"],
  ]);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "product-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/** Minimal RFC4180 parser — handles quoted fields, embedded commas/quotes. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

export default function ProductCsvImportDialog({
  shopId,
  shopCategory,
  subs,
  onClose,
  onImported,
  onToast,
}: ProductCsvImportDialogProps) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const summary = useMemo(() => {
    const counts = { new: 0, duplicate: 0, error: 0 };
    for (const r of rows) counts[r.status]++;
    return counts;
  }, [rows]);

  const checkedCount = rows.filter((r) => r.checked).length;

  async function handleFile(file: File) {
    setParsing(true);
    try {
      const text = await file.text();
      const table = parseCSV(text);
      if (table.length < 1) {
        onToast?.("CSV is empty.", "error");
        return;
      }
      const header = table[0].map((h) => h.trim().toLowerCase());
      const idx = {
        name: header.indexOf("name"),
        sub: header.indexOf("sub-category"),
        price: header.indexOf("price"),
        original: header.indexOf("original price"),
        desc: header.indexOf("description"),
        avail: header.indexOf("available"),
      };
      if (idx.name === -1 || idx.price === -1) {
        onToast?.("CSV must have at least Name and Price columns.", "error");
        return;
      }

      const existingResult = await fetchProductsByShopId(shopId);
      const existingNames = new Set(
        (existingResult.success ? existingResult.data : []).map((p) =>
          p.name.trim().toLowerCase(),
        ),
      );

      const subByName = new Map(subs.map((s) => [s.name.trim().toLowerCase(), s]));
      const othersId = await getOthersSubCategoryId(shopCategory);

      const parsedRows: ImportRow[] = [];
      for (let i = 1; i < table.length; i++) {
        const cols = table[i];
        const name = (cols[idx.name] ?? "").trim();
        const priceRaw = (cols[idx.price] ?? "").trim();
        const price = Number(priceRaw);
        const key = `import-${i}-${Date.now()}`;

        if (!name || !Number.isFinite(price) || price <= 0) {
          parsedRows.push({
            key,
            checked: false,
            status: "error",
            error: !name ? "Missing name" : "Invalid price",
            name: name || `Row ${i}`,
            description: "",
            price: 0,
            original_price: null,
            is_available: true,
            sub_category_id: null,
            subCategoryLabel: "—",
          });
          continue;
        }

        const subText = (idx.sub !== -1 ? cols[idx.sub] : "")?.trim() ?? "";
        const matchedSub = subText ? subByName.get(subText.toLowerCase()) : undefined;
        const subId = matchedSub?.id ?? (isValidUUID(othersId) ? othersId : null);
        const subLabel = matchedSub
          ? matchedSub.name
          : subText
            ? `⚠ "${subText}" not found → Others`
            : "Others (default)";

        const originalRaw = (idx.original !== -1 ? cols[idx.original] : "")?.trim() ?? "";
        const original = originalRaw ? Number(originalRaw) : null;
        const availRaw = (idx.avail !== -1 ? cols[idx.avail] : "")?.trim().toLowerCase() ?? "";
        const isAvailable = availRaw === "" || availRaw === "yes" || availRaw === "true" || availRaw === "1";

        const isDuplicate = existingNames.has(name.toLowerCase());

        parsedRows.push({
          key,
          checked: !isDuplicate,
          status: isDuplicate ? "duplicate" : "new",
          name,
          description: (idx.desc !== -1 ? cols[idx.desc] : "")?.trim() ?? "",
          price,
          original_price: original != null && Number.isFinite(original) && original > price ? original : null,
          is_available: isAvailable,
          sub_category_id: subId,
          subCategoryLabel: subLabel,
        });
      }

      setRows(parsedRows);
      if (parsedRows.length === 0) {
        onToast?.("No product rows found in the file.", "error");
      }
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : "Failed to read the file.", "error");
    } finally {
      setParsing(false);
    }
  }

  function toggleRow(key: string) {
    setRows((prev) =>
      prev.map((r) => (r.key === key && r.status !== "error" ? { ...r, checked: !r.checked } : r)),
    );
  }

  function selectAllNew() {
    setRows((prev) => prev.map((r) => (r.status === "error" ? r : { ...r, checked: r.status === "new" })));
  }

  function clearAll() {
    setRows((prev) => prev.map((r) => (r.status === "error" ? r : { ...r, checked: false })));
  }

  async function handleImport() {
    const toImport = rows.filter((r) => r.checked && r.sub_category_id);
    if (toImport.length === 0) {
      onToast?.("Select at least one row to import.", "error");
      return;
    }
    setImporting(true);
    const forms: ProductFormData[] = toImport.map((r) => ({
      name: r.name,
      description: r.description,
      price: r.price,
      original_price: r.original_price,
      deal_expires_at: null,
      image_url: "",
      images: [],
      is_available: r.is_available,
      category_id: shopCategory,
      sub_category_id: r.sub_category_id,
      variants: [],
      price_tiers: null,
    }));

    const result = await bulkCreateProducts(shopId, forms);
    setImporting(false);

    if (!result.success) {
      onToast?.(result.error, "error");
      return;
    }

    const { created, failed } = result.data;
    if (failed.length === 0) {
      onToast?.(`Imported ${created.length} product${created.length === 1 ? "" : "s"}.`, "success");
    } else {
      onToast?.(`${created.length} imported, ${failed.length} failed.`, "info");
    }
    onImported(created.length);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl dark:bg-[color:var(--tm-surface)]">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Import products from CSV</h3>
          <button type="button" onClick={onClose} className="text-lg text-zinc-400 hover:text-zinc-600">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {rows.length === 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                CSV columns: <code>Name, Sub-category, Price, Original Price, Description, Available</code>.
                Name aur Price zaroori hain, baaki optional.
              </p>
              <button
                type="button"
                onClick={downloadTemplate}
                className="rounded-full border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-300"
              >
                Download template
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
                className="block w-full text-xs text-zinc-600 file:mr-3 file:rounded-full file:border-0 file:bg-teal-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white dark:text-zinc-300"
              />
              {parsing ? <p className="text-xs text-zinc-400">Reading file…</p> : null}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <p className="text-zinc-500 dark:text-zinc-400">
                  {summary.new} new · {summary.duplicate} duplicate · {summary.error} error · {checkedCount} selected
                </p>
                <div className="flex gap-1.5">
                  <button type="button" onClick={selectAllNew} className="rounded-full border border-zinc-200 px-2.5 py-1 font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300">
                    Select new
                  </button>
                  <button type="button" onClick={clearAll} className="rounded-full border border-zinc-200 px-2.5 py-1 font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300">
                    Clear
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900">
                    <tr>
                      <th className="px-2 py-2" />
                      <th className="px-2 py-2 font-semibold">Name</th>
                      <th className="px-2 py-2 font-semibold">Sub-category</th>
                      <th className="px-2 py-2 font-semibold">Price</th>
                      <th className="px-2 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={r.checked}
                            disabled={r.status === "error"}
                            onChange={() => toggleRow(r.key)}
                          />
                        </td>
                        <td className="px-2 py-1.5 font-medium text-zinc-800 dark:text-zinc-100">{r.name}</td>
                        <td className="px-2 py-1.5 text-zinc-500">{r.subCategoryLabel}</td>
                        <td className="px-2 py-1.5 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {r.price > 0 ? r.price : "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              r.status === "new"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : r.status === "duplicate"
                                  ? "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                                  : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                            }`}
                          >
                            {r.status === "new" ? "New" : r.status === "duplicate" ? "Duplicate" : r.error ?? "Error"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
            Cancel
          </button>
          {rows.length > 0 ? (
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || checkedCount === 0}
              className="tm-cta rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {importing ? "Importing…" : `Import ${checkedCount || ""} Product${checkedCount === 1 ? "" : "s"}`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
