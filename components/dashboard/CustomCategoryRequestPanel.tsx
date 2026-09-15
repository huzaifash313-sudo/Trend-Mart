"use client";

/**
 * Merchant: request a custom main category (+ subs) or a sub-category.
 * Soft-live for this shop while pending; admin can approve / reject / disable.
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchShopCategoryRequests,
  requestCustomCategory,
  requestCustomSubCategory,
  type CategoryRequest,
} from "@/services/categoryRequestService";
import { useToast } from "@/components/Toast";

const ICONS = ["📦", "🚿", "🔧", "🧱", "🎨", "🛠️", "🏠", "⚡", "🧴", "🪑"];

export default function CustomCategoryRequestPanel({
  shopId,
  currentCategory,
  onCategoryCreated,
}: {
  shopId: string;
  currentCategory: string;
  onCategoryCreated?: (categoryName: string) => void;
}) {
  const { addToast } = useToast();
  const [mode, setMode] = useState<"category" | "subcategory">("category");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [description, setDescription] = useState("");
  const [subsText, setSubsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<CategoryRequest[]>([]);

  const reload = useCallback(async () => {
    const res = await fetchShopCategoryRequests(shopId);
    if (res.success) setHistory(res.data);
  }, [shopId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function submit() {
    if (!name.trim()) {
      addToast("Name likho", "info");
      return;
    }
    setBusy(true);
    try {
      if (mode === "category") {
        const subs = subsText
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean);
        const res = await requestCustomCategory({
          shopId,
          name: name.trim(),
          icon,
          description,
          subcategories: subs,
        });
        if (!res.success) {
          addToast(res.error, "error");
          return;
        }
        addToast(
          "Custom category bhej di — aap abhi use kar sakte ho. Admin ko signal chala gaya.",
          "success",
        );
        onCategoryCreated?.(res.data.category.name);
      } else {
        const res = await requestCustomSubCategory({
          shopId,
          parentCategory: currentCategory || "Others / Universal",
          name: name.trim(),
          icon,
          description,
        });
        if (!res.success) {
          addToast(res.error, "error");
          return;
        }
        addToast(
          "Sub-category add ho gayi (pending review). Products pe abhi use karo.",
          "success",
        );
      }
      setName("");
      setDescription("");
      setSubsText("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
          Custom category / sub-category
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          Apni trade ke liye naya category ya sub-category banao. Aapke store pe
          soft-live ho jata hai; admin approve / band kar sakta hai.
        </p>
      </div>

      <div className="flex gap-1 rounded-xl bg-zinc-200/80 p-1 dark:bg-zinc-800">
        {(
          [
            ["category", "New category"],
            ["subcategory", "New sub-category"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              mode === key
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                : "text-zinc-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "subcategory" ? (
        <p className="text-[11px] text-zinc-500">
          Parent: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{currentCategory}</span>
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Icon
          </label>
          <div className="flex flex-wrap gap-1">
            {ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                className={`rounded-lg border px-2 py-1 text-sm ${
                  icon === ic
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                    : "border-zinc-200 dark:border-zinc-700"
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              mode === "category"
                ? "e.g. Paint & Chemicals"
                : "e.g. Brass Valves"
            }
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
      </div>

      {mode === "category" ? (
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Sub-categories (comma or new line)
          </label>
          <textarea
            value={subsText}
            onChange={(e) => setSubsText(e.target.value)}
            rows={3}
            placeholder={"Interior Paint\nExterior Paint\nThinner & Tools"}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {busy ? "Sending…" : mode === "category" ? "Create & notify admin" : "Add sub-category"}
      </button>

      {history.length > 0 ? (
        <div className="border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Your requests
          </p>
          <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 dark:bg-zinc-800"
              >
                <span className="truncate font-medium text-zinc-800 dark:text-zinc-100">
                  {h.request_type === "category"
                    ? h.category_name
                    : `${h.parent_category} → ${h.subcategory_name}`}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    h.status === "pending"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                      : h.status === "approved"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                  }`}
                >
                  {h.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
