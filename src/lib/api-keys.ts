// Server-only — imports node:crypto. Never import this file from a
// client component ("use client"), not even for a type/constant, or
// webpack will try to bundle node:crypto for the browser and the build
// will fail with an "Import trace for requested module: node:crypto"
// error. Client-safe scope constants live in api-key-scopes.ts instead —
// re-exported below for existing server-side imports.
import { randomBytes, createHash } from "node:crypto";
import { API_KEY_SCOPES, type ApiKeyScope } from "./api-key-scopes";

export { API_KEY_SCOPES, type ApiKeyScope };

const KEY_PREFIX = "mk_live_";
/** How much of the plaintext key is kept (as key_prefix) for the admin
 * list to display — enough to recognize a key, nowhere near enough to
 * reconstruct it. */
const VISIBLE_PREFIX_LENGTH = KEY_PREFIX.length + 8;

export interface GeneratedApiKey {
  /** Shown to the admin exactly once, at creation. Never stored. */
  raw: string;
  /** Stored — the only copy of the key that touches the database. */
  hash: string;
  /** Stored, shown in the admin list. */
  prefix: string;
}

/** sha256, hex-encoded. Used both when minting a new key (to compute
 * what gets stored) and when verifying an incoming request (to compute
 * what to look up) — the raw key itself is never sent to Postgres. */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
  const raw = `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
  return {
    raw,
    hash: hashApiKey(raw),
    prefix: raw.slice(0, VISIBLE_PREFIX_LENGTH),
  };
}
