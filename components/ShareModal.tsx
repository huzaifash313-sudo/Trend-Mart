"use client";

import { useState, useCallback } from "react";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function XIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function TwitterXIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface ShareModalProps {
  title: string;
  description?: string;
  url: string;
  whatsappMessage?: string;
  onClose: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function ShareModal({
  title,
  description = "Check out this shop on TrendsMart!",
  url,
  whatsappMessage,
  onClose,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [url]);

  const handleWhatsAppShare = useCallback(() => {
    const text = encodeURIComponent(whatsappMessage ?? `${title}\n${description}\n\n${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, [title, description, url, whatsappMessage]);

  const handleNativeShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: description, url });
      } catch {
        // User cancelled or not supported
      }
    } else {
      handleCopyLink();
    }
  }, [title, description, url, handleCopyLink]);

  const handleTwitterShare = useCallback(() => {
    const text = encodeURIComponent(`${title} — ${description}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`, "_blank");
  }, [title, description, url]);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <ShareIcon />
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Share</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300" aria-label="Close"><XIcon /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-600 truncate dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">{url}</div>
            <button type="button" onClick={handleCopyLink} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 shrink-0">
              {copied ? <CheckIcon /> : <CopyIcon />}{copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={handleWhatsAppShare} className="flex flex-col items-center gap-1.5 rounded-xl bg-wa-50 px-3 py-3 text-center transition-colors hover:bg-wa-100 dark:bg-wa-900/20 dark:hover:bg-wa-900/30"><WhatsAppIcon /><span className="text-xs font-semibold text-wa-700 dark:text-wa-300">WhatsApp</span></button>
            <button type="button" onClick={handleTwitterShare} className="flex flex-col items-center gap-1.5 rounded-xl bg-zinc-100 px-3 py-3 text-center transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"><TwitterXIcon /><span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">X / Twitter</span></button>
            <button type="button" onClick={handleNativeShare} className="flex flex-col items-center gap-1.5 rounded-xl bg-zinc-100 px-3 py-3 text-center transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"><ShareIcon /><span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">More</span></button>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}