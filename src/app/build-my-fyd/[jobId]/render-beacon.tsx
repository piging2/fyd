"use client";

/**
 * First-render beacon for the hour-10 metric URL -> FIRST TRUSTWORTHY
 * USEFUL RENDER. Fires once per page mount; the route stamps
 * report.timings.firstRenderAt only when unset. Best-effort: failures
 * are swallowed so the beacon can never break the render.
 */
import { useEffect, useRef } from "react";

export default function RenderBeacon({ jobId }: { jobId: string }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    fetch("/api/fyd/build/" + encodeURIComponent(jobId) + "/rendered", {
      method: "POST",
      keepalive: true,
    }).catch(() => {});
  }, [jobId]);
  return null;
}
