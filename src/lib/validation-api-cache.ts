// API Cache settings validation schemas — standalone module so the diff
// to validation.ts is trivially reviewable, same pattern as
// validation-fragment-cache.ts; import from here in the route handlers.

import { z } from "zod";

const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;
const CACHE_TYPES = ["rest", "graphql", "json"] as const;
const ETAG_ALGORITHMS = ["md5", "sha1", "sha256"] as const;

export const endpointTtlRuleInputSchema = z.object({
  id: z.string().trim().min(1).max(64),
  pattern: z.string().trim().min(1).max(256),
  methods: z.array(z.enum(HTTP_METHODS)).min(1).max(6),
  ttlSeconds: z.number().int().min(0).max(86400),
  enabled: z.boolean(),
  cacheType: z.enum(CACHE_TYPES),
  note: z.string().trim().max(256),
});

export const apiCacheSettingsInputSchema = z.object({
  enabled: z.boolean().optional(),
  restEnabled: z.boolean().optional(),
  graphqlEnabled: z.boolean().optional(),
  jsonResponseEnabled: z.boolean().optional(),
  defaultTtlSeconds: z.number().int().min(0).max(86400).optional(),
  staleWhileRevalidateSeconds: z.number().int().min(0).max(600).optional(),
  bypassAuthenticated: z.boolean().optional(),
  bypassQueryString: z.boolean().optional(),
  varyByAccept: z.boolean().optional(),
  varyByOrigin: z.boolean().optional(),
  varyByAcceptEncoding: z.boolean().optional(),
  endpointRules: z.array(endpointTtlRuleInputSchema).max(50).optional(),
  conditionalRequestsEnabled: z.boolean().optional(),
  etagEnabled: z.boolean().optional(),
  etagAlgorithm: z.enum(ETAG_ALGORITHMS).optional(),
  etagWeak: z.boolean().optional(),
  lastModifiedEnabled: z.boolean().optional(),
  lastModifiedGranularitySeconds: z.number().int().min(1).max(3600).optional(),
});


export const apiCachePurgeInputSchema = z.object({
  scope: z.enum(["all", "endpoint"]),
  pattern: z.string().trim().min(1).max(256).optional(),
});

