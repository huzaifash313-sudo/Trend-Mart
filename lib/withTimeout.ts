/**
 * Resolve a promise, or give up after `ms` and resolve `fallback()`.
 *
 * Guards the app against hangs when a third-party endpoint (e.g. Supabase)
 * never responds on a given network/browser. A stuck request must never
 * trap the user on a spinner — the caller decides what to do on timeout.
 *
 * First result wins: a real value resolves early, a rejection before the
 * deadline rejects (caller catches), and a late rejection after the timeout
 * is swallowed so it can never surface as an unhandled rejection.
 */
export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  fallback: () => T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback());
      }
    }, ms);

    Promise.resolve(promise).then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      },
    );
  });
}
