import { Suspense, type ReactNode } from "react";

/** Shared shell so route skeletons always fill the viewport (footer stays below). */
export default function PageLoadingShell({ children }: { children: ReactNode }) {
  return (
    <div className="tm-page-loading mx-auto w-full max-w-7xl px-3 py-4 sm:px-4">
      {children}
    </div>
  );
}

/** Tiny suspense boundary helper for ScrollToTop (needs useSearchParams). */
export function ScrollToTopSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
