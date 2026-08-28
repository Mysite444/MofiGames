// DNS Cache settings validation schemas — Admin → Cache → DNS Cache.
// Import from here in the route handlers under
// src/app/api/admin/cache/dns/** and src/app/api/dns-prefetch/**.

import { z } from "zod";
import { CNAME_FLATTENING_MODES, RESOLVER_TTL_LIMITS, RESOLVER_MAX_ENTRIES_LIMITS } from "./dns-cache-settings";
import { DNS_DOMAIN_PATTERN } from "./dns-prefetch-settings";

// ── Admin-only: dns_cache_settings (Cloudflare DNS / Resolver Cache / OS notes) ──

export const dnsCacheSettingsInputSchema = z.object({
  // Cloudflare DNS credentials — same "blank/omitted leaves it
  // untouched, clearCredentials is the only way to actually wipe it"
  // shape as cdnCacheSettingsInputSchema.
  zoneId: z.string().trim().max(64).optional(),
  apiToken: z.string().trim().max(512).optional(),
  clearCredentials: z.boolean().optional(),

  dnssecEnabled: z.boolean().optional(),
  cnameFlatteningMode: z.enum(CNAME_FLATTENING_MODES as [string, ...string[]]).optional(),

  resolverCacheEnabled: z.boolean().optional(),
  resolverCacheMinTtlSeconds: z.number().int().min(RESOLVER_TTL_LIMITS.min.min).max(RESOLVER_TTL_LIMITS.min.max).optional(),
  resolverCacheMaxTtlSeconds: z.number().int().min(RESOLVER_TTL_LIMITS.max.min).max(RESOLVER_TTL_LIMITS.max.max).optional(),
  resolverCacheMaxEntries: z.number().int().min(RESOLVER_MAX_ENTRIES_LIMITS.min).max(RESOLVER_MAX_ENTRIES_LIMITS.max).optional(),

  osDnsRunbookNotes: z.string().trim().max(4000).optional(),
}).superRefine((data, ctx) => {
  if (
    data.resolverCacheMinTtlSeconds !== undefined &&
    data.resolverCacheMaxTtlSeconds !== undefined &&
    data.resolverCacheMinTtlSeconds > data.resolverCacheMaxTtlSeconds
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Minimum TTL can't be greater than maximum TTL.",
      path: ["resolverCacheMinTtlSeconds"],
    });
  }
});

export const dnsResolverActionSchema = z
  .object({
    action: z.enum(["test", "clear"]),
    hostname: z.string().trim().min(1).max(253).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "test" && !data.hostname) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A hostname is required to test resolution.", path: ["hostname"] });
    }
  });

// ── Publicly-readable: dns_prefetch_settings (Browser DNS Cache) ──────────────

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(DNS_DOMAIN_PATTERN, "Enter a bare hostname (e.g. www.example.com), no scheme or path.");

export const dnsPrefetchSettingsInputSchema = z.object({
  dnsPrefetchControlEnabled: z.boolean().optional(),
  dnsPrefetchDomains: z.array(domainSchema).max(30, "Maximum 30 DNS prefetch domains.").optional(),
  preconnectDomains: z.array(domainSchema).max(15, "Maximum 15 preconnect domains.").optional(),
});
