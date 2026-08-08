/* -------------------------------------------------------------------------- */
/*  TrendMart — Service Portfolio Manager (Prompt 4)                           */
/*                                                                             */
/*  Dashboard module for service providers to manage their project portfolio.  */
/*  Features:                                                                  */
/*   - Upload before/after project photos via ImageUpload                     */
/*   - Write descriptions of completed jobs                                   */
/*   - Record client names and verified reviews                               */
/*   - Toggle publish/unpublish for the public storefront                     */
/*   - Delete portfolio entries                                               */
/* -------------------------------------------------------------------------- */

"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { getSafeImageUrl } from "@/services/storageService";
import { useToast } from "@/components/Toast";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PortfolioItem {
  id: string;
  shop_id: string;
  title: string;
  description: string;
  before_image_url: string | null;
  after_image_url: string | null;
  client_name: string;
  client_review: string;
  client_rating: number;
  project_date: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

interface PortfolioFormData {
  title: string;
  description: string;
  beforeImageFile: File | null;
  afterImageFile: File | null;
  beforeImagePreview: string;
  afterImagePreview: string;
  client_name: string;
  client_review: string;
  client_rating: number;
  project_date: string;
  is_published: boolean;
}

interface ServicePortfolioManagerProps {
  shopId: string;
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function PlusIcon() { return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>); }
function EditIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>); }
function TrashIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>); }
function EyeIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>); }
function EyeOffIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>); }
function StarFilledIcon() { return (<svg className="h-4 w-4 text-amber-400" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>); }
function StarEmptyIcon() { return (<svg className="h-4 w-4 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>); }
function SpinnerIcon() { return (<svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>); }
function CameraIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>); }
function CloseIcon() { return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>); }

// ─── Component ──────────────────────────────────────────────────────────────

export default function ServicePortfolioManager({ shopId }: ServicePortfolioManagerProps) {
  const supabase = createClient();
  const { addToast } = useToast();

  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const emptyForm: PortfolioFormData = {
    title: "",
    description: "",
    beforeImageFile: null,
    afterImageFile: null,
    beforeImagePreview: "",
    afterImagePreview: "",
    client_name: "",
    client_review: "",
    client_rating: 0,
    project_date: new Date().toISOString().split("T")[0],
    is_published: true,
  };

  const [form, setForm] = useState<PortfolioFormData>(emptyForm);

  // ── Load portfolio items ──────────────────────────────────────────────────

  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("service_portfolio")
        .select("*")
        .eq("shop_id", shopId)
        .order("project_date", { ascending: false });

      if (error) throw error;
      setPortfolioItems(data as PortfolioItem[]);
    } catch (err) {
      addToast("Failed to load portfolio items.", "error");
    } finally {
      setLoading(false);
    }
  }, [supabase, shopId, addToast]);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  // ── Form helpers ──────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setForm({ ...emptyForm, project_date: new Date().toISOString().split("T")[0] });
    setEditingId(null);
    setShowForm(false);
  }, [emptyForm]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: "before" | "after") => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate: max 5MB images
    if (file.size > 5 * 1024 * 1024) {
      addToast("Image must be under 5 MB.", "error");
      return;
    }

    const preview = URL.createObjectURL(file);

    setForm(prev => ({
      ...prev,
      [`${type}ImageFile`]: file,
      [`${type}ImagePreview`]: preview,
    }));
  }, [addToast]);

  const removeImage = useCallback((type: "before" | "after") => {
    setForm(prev => ({
      ...prev,
      [`${type}ImageFile`]: null,
      [`${type}ImagePreview`]: "",
    }));
  }, []);

  const openEditForm = useCallback((item: PortfolioItem) => {
    setForm({
      title: item.title,
      description: item.description,
      beforeImageFile: null,
      afterImageFile: null,
      beforeImagePreview: item.before_image_url ? getSafeImageUrl(item.before_image_url, "product") : "",
      afterImagePreview: item.after_image_url ? getSafeImageUrl(item.after_image_url, "product") : "",
      client_name: item.client_name,
      client_review: item.client_review,
      client_rating: item.client_rating,
      project_date: item.project_date,
      is_published: item.is_published,
    });
    setEditingId(item.id);
    setShowForm(true);
  }, []);

  // ── Upload image to Supabase Storage ─────────────────────────────────────

  const uploadImage = async (file: File, prefix: string): Promise<string> => {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `portfolio/${shopId}/${prefix}_${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(path);

    return urlData.publicUrl;
  };

  // ── Save / Update ─────────────────────────────────────────────────────────

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.title.trim()) {
      addToast("Project title is required.", "error");
      return;
    }

    setSaving(true);

    try {
      let beforeUrl = editingId
        ? portfolioItems.find(p => p.id === editingId)?.before_image_url ?? null
        : null;
      let afterUrl = editingId
        ? portfolioItems.find(p => p.id === editingId)?.after_image_url ?? null
        : null;

      // Upload new before image if selected
      if (form.beforeImageFile) {
        beforeUrl = await uploadImage(form.beforeImageFile, "before");
      }

      // Upload new after image if selected
      if (form.afterImageFile) {
        afterUrl = await uploadImage(form.afterImageFile, "after");
      }

      const payload = {
        shop_id: shopId,
        title: form.title.trim(),
        description: form.description.trim(),
        before_image_url: beforeUrl,
        after_image_url: afterUrl,
        client_name: form.client_name.trim(),
        client_review: form.client_review.trim(),
        client_rating: form.client_rating,
        project_date: form.project_date,
        is_published: form.is_published,
      };

      if (editingId) {
        const { error } = await supabase
          .from("service_portfolio")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;
        addToast("Portfolio item updated!", "success");
      } else {
        const { error } = await supabase
          .from("service_portfolio")
          .insert(payload);

        if (error) throw error;
        addToast("Portfolio item added!", "success");
      }

      resetForm();
      await loadPortfolio();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save portfolio item.", "error");
    } finally {
      setSaving(false);
    }
  }, [form, shopId, editingId, supabase, addToast, resetForm, loadPortfolio, portfolioItems]);

  // ── Toggle publish ───────────────────────────────────────────────────────

  const togglePublish = useCallback(async (item: PortfolioItem) => {
    try {
      const { error } = await supabase
        .from("service_portfolio")
        .update({ is_published: !item.is_published })
        .eq("id", item.id);

      if (error) throw error;

      setPortfolioItems(prev =>
        prev.map(p => p.id === item.id ? { ...p, is_published: !p.is_published } : p)
      );
      addToast(item.is_published ? "Hidden from storefront." : "Published to storefront.", "success");
    } catch {
      addToast("Failed to toggle visibility.", "error");
    }
  }, [supabase, addToast]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this portfolio item? This cannot be undone.")) return;

    setDeleting(id);
    try {
      const { error } = await supabase
        .from("service_portfolio")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setPortfolioItems(prev => prev.filter(p => p.id !== id));
      addToast("Portfolio item deleted.", "success");
    } catch {
      addToast("Failed to delete.", "error");
    } finally {
      setDeleting(null);
    }
  }, [supabase, addToast]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header & Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Service Portfolio</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Showcase your completed projects with before/after photos and client testimonials.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center gap-2 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-600/25 transition-all hover:bg-orange-700"
        >
          <PlusIcon /> Add Project
        </button>
      </div>

      {/* Portfolio Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3 h-40 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
              <div className="mb-2 h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-3 w-full rounded bg-zinc-100 dark:bg-zinc-800" />
            </div>
          ))}
        </div>
      ) : portfolioItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center dark:border-zinc-700 dark:bg-zinc-800/50">
          <CameraIcon />
          <p className="mt-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400">No portfolio items yet</p>
          <p className="mt-1 text-xs text-zinc-400">Upload before/after project photos to build client trust.</p>
          <button
            type="button"
            onClick={() => { resetForm(); setShowForm(true); }}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange-600 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-700"
          >
            <PlusIcon /> Add Your First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portfolioItems.map(item => (
            <div
              key={item.id}
              className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              {/* Before/After Collage */}
              <div className="relative flex h-44">
                <div className="flex-1 relative bg-zinc-100 dark:bg-zinc-800">
                  {item.before_image_url ? (
                    <Image
                      src={getSafeImageUrl(item.before_image_url, "product")}
                      alt={`Before: ${item.title}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 50vw, 16rem"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-400">No before photo</div>
                  )}
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">BEFORE</span>
                </div>
                <div className="w-px bg-white" />
                <div className="flex-1 relative bg-zinc-100 dark:bg-zinc-800">
                  {item.after_image_url ? (
                    <Image
                      src={getSafeImageUrl(item.after_image_url, "product")}
                      alt={`After: ${item.title}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 50vw, 16rem"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-400">No after photo</div>
                  )}
                  <span className="absolute right-1 top-1 rounded bg-emerald-600/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">AFTER</span>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 line-clamp-1">{item.title}</h3>
                  <div className="flex shrink-0 items-center gap-1">
                    {/* Published indicator */}
                    <button
                      type="button"
                      onClick={() => togglePublish(item)}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                      title={item.is_published ? "Visible on storefront — click to hide" : "Hidden — click to publish"}
                    >
                      {item.is_published ? <EyeIcon /> : <EyeOffIcon />}
                    </button>
                  </div>
                </div>

                {item.description && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{item.description}</p>
                )}

                {/* Rating stars */}
                {item.client_rating > 0 && (
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      i < item.client_rating ? <StarFilledIcon key={i} /> : <StarEmptyIcon key={i} />
                    ))}
                  </div>
                )}

                {item.client_name && (
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    — {item.client_name}
                  </p>
                )}

                {item.client_review && (
                  <p className="text-xs italic text-zinc-500 dark:text-zinc-400 line-clamp-2">
                    &ldquo;{item.client_review}&rdquo;
                  </p>
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-zinc-400">{item.project_date}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditForm(item)}
                      className="rounded-full p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      title="Edit"
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={deleting === item.id}
                      className="rounded-full p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                      title="Delete"
                    >
                      {deleting === item.id ? <SpinnerIcon /> : <TrashIcon />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Form Modal ──────────────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
          onClick={() => resetForm()}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {editingId ? "Edit Project" : "Add New Project"}
              </h3>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 p-6">
              {/* Title */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Project Title *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g., AC Deep Clean — Split Unit"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of the completed job..."
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              {/* Before / After Images */}
              <div className="grid grid-cols-2 gap-3">
                {/* Before Image */}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Before Photo</label>
                  {form.beforeImagePreview ? (
                    <div className="relative h-28 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                      <Image
                        src={form.beforeImagePreview}
                        alt="Before preview"
                        fill
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage("before")}
                        className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 transition-colors hover:border-orange-400 hover:text-orange-500 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-orange-500">
                      <CameraIcon />
                      <span className="text-xs">Tap to upload</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileSelect(e, "before")}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* After Image */}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">After Photo</label>
                  {form.afterImagePreview ? (
                    <div className="relative h-28 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                      <Image
                        src={form.afterImagePreview}
                        alt="After preview"
                        fill
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage("after")}
                        className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 transition-colors hover:border-emerald-400 hover:text-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-emerald-500">
                      <CameraIcon />
                      <span className="text-xs">Tap to upload</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileSelect(e, "after")}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Client Name */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Client Name</label>
                <input
                  type="text"
                  value={form.client_name}
                  onChange={(e) => setForm(f => ({ ...f, client_name: e.target.value }))}
                  placeholder="Anonymized or with permission"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              {/* Client Review */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Client Testimonial</label>
                <textarea
                  rows={2}
                  value={form.client_review}
                  onChange={(e) => setForm(f => ({ ...f, client_review: e.target.value }))}
                  placeholder="What did the client say about your work?"
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              {/* Rating & Date row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Rating (1-5)</label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, client_rating: n === f.client_rating ? 0 : n }))}
                        className="p-0.5"
                      >
                        {n <= form.client_rating ? <StarFilledIcon /> : <StarEmptyIcon />}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Project Date</label>
                  <input
                    type="date"
                    value={form.project_date}
                    onChange={(e) => setForm(f => ({ ...f, project_date: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>

              {/* Published toggle */}
              <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Publish to Storefront</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Visible to customers on your public profile</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.is_published}
                  onClick={() => setForm(f => ({ ...f, is_published: !f.is_published }))}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    form.is_published ? "bg-orange-600" : "bg-zinc-300 dark:bg-zinc-600"
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    form.is_published ? "translate-x-5" : "translate-x-0"
                  }`} />
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-full px-6 py-2.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.title.trim()}
                  className="flex-1 rounded-full bg-orange-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-600/25 transition-all hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <><SpinnerIcon /> Saving...</> : editingId ? "Update Project" : "Add Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}