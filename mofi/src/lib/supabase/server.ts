import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTimeoutFetch } from "./timeout-fetch";

/**
 * Supabase client for use on the server (Server Components, Route Handlers,
 * Server Actions). Reads/writes the session via cookies so auth state stays
 * in sync between server and client. Still uses the public anon key — RLS
 * policies, not this key, are what protect the data.
 *
 * Must be called fresh on every request (cookies() is request-scoped), so
 * this is a factory, not a singleton.
 *
 * Every query made through this client is bounded by createTimeoutFetch()
 * (see timeout-fetch.ts) — if Supabase is unreachable or hanging, callers
 * get a rejected promise within a few seconds instead of waiting on the
 * platform's own request timeout. This is what makes the try/catch +
 * static-fallback pattern in games-server.ts / content-server.ts /
 * site-identity.ts / seo-settings.ts actually fire promptly instead of
 * just eventually.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: createTimeoutFetch() },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                // Enforce secure transport in production regardless of what
                // Supabase SSR defaults to.  SameSite=Lax is the recommended
                // default — it blocks cross-site POST abuse while still
                // allowing normal top-level navigations (e.g. OAuth redirects).
                // Path=/ ensures the cookie is sent to every route, not just
                // the one that set it.
                secure: process.env.NODE_ENV === "production",
                sameSite: (options?.sameSite as CookieOptions["sameSite"]) ?? "lax",
                path: options?.path ?? "/",
              })
            );
          } catch {
            // setAll called from a Server Component — safe to ignore since
            // middleware handles refreshing the session cookie on requests.
          }
        },
      },
    }
  );
}
