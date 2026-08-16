"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Confirm & Prompt Dialog Provider                               */
/*                                                                            */
/*  Replaces native window.confirm() / window.alert() / window.prompt() with  */
/*  styled, theme-aware modals. Exposes promise-based helpers via a hook so   */
/*  call sites read naturally:                                                */
/*                                                                            */
/*    const { confirm } = useConfirm();                                       */
/*    if (!(await confirm("Delete this?"))) return;                           */
/*                                                                            */
/*  Dialogs are queued, so overlapping calls resolve in order.                */
/* -------------------------------------------------------------------------- */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ConfirmVariant = "default" | "danger" | "warning";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

export interface PromptOptions {
  title?: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, an empty value is treated as a cancel (returns null). */
  required?: boolean;
}

type ResolveValue = boolean | string | null;

interface DialogState {
  type: "confirm" | "prompt";
  options: ConfirmOptions | PromptOptions;
  resolve: (value: ResolveValue) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  prompt: (options: PromptOptions | string) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined);

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within <ConfirmProvider>");
  }
  return ctx;
}

/* -------------------------------------------------------------------------- */
/*  Provider                                                                   */
/* -------------------------------------------------------------------------- */

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<DialogState | null>(null);
  const queueRef = useRef<DialogState[]>([]);

  const enqueue = useCallback((item: DialogState) => {
    queueRef.current.push(item);
    setActive((prev) => prev ?? queueRef.current.shift() ?? null);
  }, []);

  const resolveActive = useCallback((value: ResolveValue) => {
    setActive((prev) => {
      prev?.resolve(value);
      return queueRef.current.shift() ?? null;
    });
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions | string) => {
      const opts: ConfirmOptions =
        typeof options === "string" ? { message: options } : options;
      return new Promise<boolean>((resolve) => {
        enqueue({
          type: "confirm",
          options: opts,
          resolve: (v) => resolve(v as boolean),
        });
      });
    },
    [enqueue],
  );

  const prompt = useCallback(
    (options: PromptOptions | string) => {
      const opts: PromptOptions =
        typeof options === "string" ? { message: options } : options;
      return new Promise<string | null>((resolve) => {
        enqueue({
          type: "prompt",
          options: opts,
          resolve: (v) => resolve(v as string | null),
        });
      });
    },
    [enqueue],
  );

  return (
    <ConfirmContext.Provider value={{ confirm, prompt }}>
      {children}
      {active && (
        <DialogHost state={active} onResolve={resolveActive} />
      )}
    </ConfirmContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Dialog Host (renders the active dialog)                                    */
/* -------------------------------------------------------------------------- */

function DialogHost({
  state,
  onResolve,
}: {
  state: DialogState;
  onResolve: (value: ResolveValue) => void;
}) {
  if (state.type === "confirm") {
    return <ConfirmDialog state={state} onResolve={onResolve} />;
  }
  return <PromptDialog state={state} onResolve={onResolve} />;
}

/* -------------------------------------------------------------------------- */
/*  Shared visuals                                                            */
/* -------------------------------------------------------------------------- */

const variantStyles: Record<
  ConfirmVariant,
  { iconBg: string; iconColor: string; button: string }
> = {
  default: {
    iconBg: "bg-emerald-50 dark:bg-emerald-900/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    button:
      "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500/40",
  },
  danger: {
    iconBg: "bg-red-50 dark:bg-red-900/30",
    iconColor: "text-red-600 dark:text-red-400",
    button:
      "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500/40",
  },
  warning: {
    iconBg: "bg-amber-50 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    button:
      "bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-500/40",
  },
};

function AlertIcon({ color }: { color: string }) {
  return (
    <svg
      className={`h-6 w-6 ${color}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function TrashIcon({ color }: { color: string }) {
  return (
    <svg
      className={`h-6 w-6 ${color}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Confirm Dialog                                                            */
/* -------------------------------------------------------------------------- */

function ConfirmDialog({
  state,
  onResolve,
}: {
  state: DialogState;
  onResolve: (value: ResolveValue) => void;
}) {
  const opts = state.options as ConfirmOptions;
  const variant = opts.variant ?? "danger";
  const title = opts.title ?? "Are you sure?";
  const confirmLabel = opts.confirmLabel ?? "Confirm";
  const cancelLabel = opts.cancelLabel ?? "Cancel";
  const styles = variantStyles[variant];

  const cancel = () => onResolve(false);
  const confirmAction = () => onResolve(true);

  /* Escape cancels; Enter confirms. */
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
        onClick={cancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-start gap-3 p-5">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${styles.iconBg}`}
          >
            {variant === "danger" ? (
              <TrashIcon color={styles.iconColor} />
            ) : (
              <AlertIcon color={styles.iconColor} />
            )}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              {title}
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {opts.message}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
          <button
            type="button"
            onClick={cancel}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={confirmAction}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 ${styles.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Prompt Dialog                                                             */
/* -------------------------------------------------------------------------- */

function PromptDialog({
  state,
  onResolve,
}: {
  state: DialogState;
  onResolve: (value: ResolveValue) => void;
}) {
  const opts = state.options as PromptOptions;
  const title = opts.title ?? "Please confirm";
  const confirmLabel = opts.confirmLabel ?? "OK";
  const cancelLabel = opts.cancelLabel ?? "Cancel";
  const [value, setValue] = useState(opts.initialValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const cancel = () => onResolve(null);

  const submit = () => {
    const trimmed = value.trim();
    if (opts.required && trimmed.length === 0) {
      onResolve(null);
      return;
    }
    onResolve(trimmed);
  };

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
        onClick={cancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="p-5">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          {opts.message && (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {opts.message}
            </p>
          )}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={opts.placeholder ?? "Type here…"}
            className="mt-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
          <button
            type="button"
            onClick={cancel}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
