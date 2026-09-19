import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in the browser (client components, "use client"
 * files). Uses the public anon key — safe to expose, since every table it
 * can touch is locked down with Row Level Security policies. Never use the
 * service_role key here.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
