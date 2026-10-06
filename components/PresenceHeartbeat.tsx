"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_MS = 45000;
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

export function PresenceHeartbeat() {
  const lastInteractionRef = useRef(Date.now());

  useEffect(() => {
    const markActive = () => {
      lastInteractionRef.current = Date.now();
    };

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "focus"];
    for (const event of events) window.addEventListener(event, markActive, { passive: true });

    const sendHeartbeat = () => {
      const active =
        document.visibilityState === "visible" &&
        Date.now() - lastInteractionRef.current <= ACTIVE_WINDOW_MS;

      void fetch("/api/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active }),
        keepalive: true,
      }).catch(() => undefined);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") markActive();
      sendHeartbeat();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_MS);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      for (const event of events) window.removeEventListener(event, markActive);
    };
  }, []);

  return null;
}
