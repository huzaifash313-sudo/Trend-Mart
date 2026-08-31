"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  addToast: (message: string, variant?: ToastVariant) => void;
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                   */
/* -------------------------------------------------------------------------- */

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* -------------------------------------------------------------------------- */
/*  Provider                                                                  */
/* -------------------------------------------------------------------------- */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = "info", durationMs = 4000) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, variant }]);
      // Auto-dismiss
      setTimeout(() => removeToast(id), durationMs);
    },
    [removeToast],
  );

  // Listen for custom toast events dispatched by ErrorBoundary and other
  // non-React subsystems (e.g. service workers, error handlers).
  useEffect(() => {
    const handler = (e: Event) => {
      const { type, message, duration } = (e as CustomEvent).detail ?? {};
      // Map external type strings to our ToastVariant
      const variantMap: Record<string, ToastVariant> = {
        success: "success",
        error: "error",
        info: "info",
      };
      const variant = variantMap[type] ?? "info";
      addToast(message, variant, duration ?? 8000);
    };

    window.addEventListener("trendsmart:toast", handler);
    return () => window.removeEventListener("trendsmart:toast", handler);
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}

      {/* Toast container — fixed above bottom nav on mobile, bottom-right on desktop */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-20 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 md:bottom-6 md:left-auto md:right-6 md:translate-x-0 md:items-end"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Individual Toast Item                                                     */
/* -------------------------------------------------------------------------- */

const variantStyles: Record<ToastVariant, string> = {
  success: "bg-emerald-600 text-white",
  error: "bg-red-600 text-white",
  info: "bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900",
};

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIconSmall() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const manualCloseRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!manualCloseRef.current) onDismiss();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-full items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg transition-all ${variantStyles[toast.variant]}`}
    >
      {toast.variant === "success" && <CheckIcon />}
      {toast.variant === "error" && <AlertIcon />}
      {toast.variant === "info" && <AlertIcon />}
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => {
          manualCloseRef.current = true;
          onDismiss();
        }}
        className="shrink-0 rounded-full p-0.5 opacity-70 hover:opacity-100"
        aria-label="Dismiss"
      >
        <XIconSmall />
      </button>
    </div>
  );
}