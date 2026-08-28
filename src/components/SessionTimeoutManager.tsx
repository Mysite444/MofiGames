"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { fetchSecuritySettings } from "@/lib/security";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart"] as const;

/** Signs a signed-in visitor out after N minutes of no interaction
 * (Admin → Security → Settings → session_timeout_minutes). Mounted once
 * near the root, inside AuthProvider — a no-op whenever `user` is null,
 * so guests and signed-out visitors are never affected. */
export function SessionTimeoutManager() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minutesRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) {
      minutesRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }

    let cancelled = false;

    fetchSecuritySettings().then((settings) => {
      if (cancelled) return;
      minutesRef.current = settings.sessionTimeoutMinutes;
      resetTimer();
    });

    function resetTimer() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const minutes = minutesRef.current;
      if (!minutes) return;
      timeoutRef.current = setTimeout(async () => {
        await logout();
        router.push("/login");
      }, minutes * 60_000);
    }

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [user, logout, router]);

  return null;
}
