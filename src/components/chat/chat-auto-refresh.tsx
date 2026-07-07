"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Near-real-time via short polling: re-fetches the server-rendered thread
// every few seconds while the tab is visible. router.refresh() preserves
// client state, so the composer draft survives each poll.
const POLL_INTERVAL_MS = 4000;

export function ChatAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);
  return null;
}
