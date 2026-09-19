// Client-safe API key constants — deliberately kept out of api-keys.ts.
// api-keys.ts imports "node:crypto" for key generation/hashing, which is
// server-only; if a client component imports anything from that file
// (even just this constant), webpack tries to bundle node:crypto for the
// browser and the build fails. Anything referenced by
// SecurityApiKeysAdminClient.tsx (or any other client component) belongs
// here instead, not in api-keys.ts.

export const API_KEY_SCOPES = [
  { value: "read:games", label: "Read games" },
  { value: "read:categories", label: "Read categories" },
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]["value"];
