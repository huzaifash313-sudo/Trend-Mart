"use client";

import { useEffect, useState } from "react";
import { useConnection, setConnection } from "@/lib/connection";

/**
 * Global "you're offline" pill.
 *
 * Floats under the navbar and fades in only when the app actually lost the
 * network (browser event OR the service worker had to serve a page from its
 * cache). It intentionally renders the same markup on the server and first
 * client paint (hidden) so hydration never mismatches; the offline state is
 * applied by an effect once mounted.
 *
 * While the pill is visible it quietly probes connectivity every few seconds
 * (the browser doesn't fire an "online" event when WiFi returns but the site
 * was previously unreachable) and clears itself the moment the network truly
 * responds — the home page then refreshes its saved content automatically.
 */
export default function ConnectionStatus() {
  const conn = useConnection();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(conn === "offline");
  }, [conn]);

  useEffect(() => {
    if (!offline) return;
    let stopped = false;

    const probe = async () => {
      try {
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch("/offline", {
          cache: "no-store",
          credentials: "omit",
          signal: ctrl.signal,
        });
        window.clearTimeout(timer);
        if (!stopped && res.ok) setConnection("online");
      } catch {
        /* still offline — keep probing */
      }
    };

    const id = window.setInterval(() => void probe(), 6000);
    void probe(); // check right away — the network may already be back
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [offline]);

  return (
    <div className={`tm-conn${offline ? " is-offline" : ""}`} aria-hidden={!offline}>
      <div className="tm-conn-inner" role="status">
        <span className="tm-conn-dot" aria-hidden="true" />
        <span className="tm-conn-text">
          You&apos;re offline — showing saved content
        </span>
        <button
          type="button"
          className="tm-conn-action"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
