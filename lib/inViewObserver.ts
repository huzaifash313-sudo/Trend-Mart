/**
 * Shared IntersectionObserver for pause-when-offscreen UI (offer tickers, etc.).
 * One browser observer for many nodes beats a per-card observer on long grids.
 */

type InViewCallback = (inView: boolean) => void;

const callbacks = new WeakMap<Element, InViewCallback>();
let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          callbacks.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { rootMargin: "80px 0px", threshold: 0.01 },
    );
  }
  return sharedObserver;
}

/** Observe an element; returns an unsubscribe that also unobserves. */
export function observeInView(el: Element, cb: InViewCallback): () => void {
  const observer = getSharedObserver();
  if (!observer) {
    cb(true);
    return () => undefined;
  }
  callbacks.set(el, cb);
  observer.observe(el);
  return () => {
    callbacks.delete(el);
    observer.unobserve(el);
  };
}
