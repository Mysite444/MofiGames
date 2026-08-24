"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { syncActiveUser } from "@/lib/game-library";

/**
 * Renders nothing. Just watches auth state and tells game-library.ts who's
 * signed in, so favorites/recently-played know when to sync with Supabase
 * vs. stay local-only. Lives in the root layout, inside <AuthProvider>.
 */
export function LibrarySync() {
  const { user, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    syncActiveUser(user?.id ?? null);
  }, [ready, user?.id]);

  return null;
}
