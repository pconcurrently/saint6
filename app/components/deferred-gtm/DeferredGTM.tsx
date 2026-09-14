"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { initializeGoogleAds } from "@/app/lib/google-ads";

interface DeferredGTMProps {
  gtmId: string;
}

/**
 * Loads GTM after the first user interaction or 12 s, whichever comes first.
 * The lightweight site-wide Google Ads tag is initialized earlier in the head.
 */
export function DeferredGTM({ gtmId }: DeferredGTMProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initializeGoogleAds();

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      "gtm.start": Date.now(),
      event: "gtm.js",
    });

    let fired = false;
    const activate = () => {
      if (fired) return;
      fired = true;
      cleanup();
      setReady(true);
    };

    const events = ["scroll", "click", "touchstart", "keydown"] as const;
    for (const evt of events) {
      window.addEventListener(evt, activate, { once: true, passive: true });
    }

    const timer = setTimeout(activate, 12_000);

    const cleanup = () => {
      clearTimeout(timer);
      for (const evt of events) {
        window.removeEventListener(evt, activate);
      }
    };

    return cleanup;
  }, []);

  if (!ready) return null;

  return (
    <Script
      id="_deferred-gtm"
      strategy="afterInteractive"
      src={`https://www.googletagmanager.com/gtm.js?id=${gtmId}`}
    />
  );
}
