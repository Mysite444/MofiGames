"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/** Site Name + Logo, set in Admin → Site Settings → Site Identity. Fetched
 * client-side (small, publicly-readable singleton row) rather than
 * threading through every page's server props, since Logo is mounted
 * site-wide in the header — same pattern NavList used before its nav/footer
 * reads moved behind the Fragment Cache (see useNavigationFragment there).
 * Falls back to the built-in "MofiGames" wordmark until the row loads or if a
 * custom logo/name was never set. No default icon mark is rendered until
 * a logo is uploaded in Site Identity — the mark slot is simply omitted. */
function useSiteIdentity() {
  const [identity, setIdentity] = useState<{ siteName: string; logoUrl: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("site_identity")
      .select("site_name, logo_url")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) {
          setIdentity({ siteName: data.site_name, logoUrl: data.logo_url });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return identity;
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  const identity = useSiteIdentity();
  const siteName = identity?.siteName || "MofiGames";
  const logoUrl = identity?.logoUrl;

  return (
    <Link href="/" className="flex items-center gap-2 shrink-0">
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={siteName} className="h-8 w-8 shrink-0 rounded-lg object-contain" />
      )}
      {!collapsed && (
        <span className="font-display text-lg font-bold tracking-tight text-white">
          {siteName}
        </span>
      )}
    </Link>
  );
}
