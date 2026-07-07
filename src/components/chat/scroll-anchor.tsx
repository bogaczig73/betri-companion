"use client";

import { useEffect, useRef } from "react";

// Jumps to the newest message on first render only; polling refreshes don't
// remount client components, so the reading position is preserved afterwards.
export function ScrollAnchor() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, []);
  return <div ref={ref} />;
}
