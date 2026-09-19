import * as crypto from "node:crypto";
import {
  connectRedis,
  authAndSelect,
  withTimeout,
  isRespError,
  type RedisConnection,
  type RedisConnOpts,
  type ActionResult,
} from "./redis-protocol";
import type { EncryptionAlgorithm } from "./session-cache-settings";

// Live-action helpers for Admin → Cache → Session Cache. The Redis pieces
// reuse the exact same RESP2 engine (./redis-protocol.ts) as Object
// Cache's test-connection/invalidate actions — see that module's comment
// for why this is hand-rolled instead of ioredis. What's specific to
// Session Cache lives here: a session-shaped round-trip test (not just
// PING — SETEX/GET/DEL against a throwaway key, so "Test Connection"
// actually proves a session write-then-read works, not merely that the
// server answers), a PUBLISH-based replication probe, and the at-rest
// encryption preview for Secure Session Storage.

/** Live connection test — Admin → Cache → Session Cache → Redis Sessions
 * → "Test Connection". Connects, authenticates, selects the configured
 * database, then does a real SETEX + GET + DEL round-trip against a
 * throwaway key under the configured prefix — a plain PING proves the
 * server is reachable, this additionally proves a session can actually
 * be written and read back under the current TTL/prefix settings. */
export async function testRedisSessionConnection(opts: RedisConnOpts, keyPrefix: string): Promise<ActionResult> {
  const start = Date.now();
  let conn: RedisConnection | null = null;
  const probeKey = `${keyPrefix}__connection_test__${crypto.randomBytes(6).toString("hex")}`;
  try {
    conn = await connectRedis(opts.host, opts.port, opts.tls, opts.connectTimeoutMs);
    await authAndSelect(conn, opts);

    const setReply = await withTimeout(
      conn.command(["SETEX", probeKey, "30", "ok"]),
      opts.connectTimeoutMs,
      "SETEX"
    );
    if (isRespError(setReply)) throw new Error(setReply.error);

    const getReply = await withTimeout(conn.command(["GET", probeKey]), opts.connectTimeoutMs, "GET");
    if (isRespError(getReply)) throw new Error(getReply.error);
    if (getReply !== "ok") throw new Error(`Round-trip mismatch: wrote "ok", read back ${JSON.stringify(getReply)}.`);

    await withTimeout(conn.command(["DEL", probeKey]), opts.connectTimeoutMs, "DEL");

    const latencyMs = Date.now() - start;
    return {
      ok: true,
      message: `Connected to ${opts.host}:${opts.port} (db ${opts.database}) — wrote and read back a test session key in ${latencyMs}ms.`,
      latencyMs,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Connection failed." };
  } finally {
    conn?.close();
  }
}

/** Session Replication test (Redis pub/sub mode) — Admin → Cache →
 * Session Cache → Session Replication → "Test Replication". Publishes
 * one message on the configured channel and reports how many
 * subscribers received it (Redis's PUBLISH reply is the subscriber
 * count). A count of 0 isn't a connection failure — it truthfully means
 * no other instance is currently subscribed to listen for it, which is
 * exactly the information an admin checking replication health wants. */
export async function testRedisReplication(opts: RedisConnOpts, channel: string): Promise<ActionResult> {
  const start = Date.now();
  let conn: RedisConnection | null = null;
  try {
    conn = await connectRedis(opts.host, opts.port, opts.tls, opts.connectTimeoutMs);
    await authAndSelect(conn, opts);

    const payload = JSON.stringify({ type: "replication_test", at: new Date().toISOString() });
    const reply = await withTimeout(conn.command(["PUBLISH", channel, payload]), opts.connectTimeoutMs, "PUBLISH");
    if (isRespError(reply)) throw new Error(reply.error);

    const subscriberCount = Number(reply) || 0;
    const latencyMs = Date.now() - start;
    return {
      ok: true,
      message:
        subscriberCount > 0
          ? `Published to "${channel}" — ${subscriberCount} subscriber${subscriberCount === 1 ? "" : "s"} received it (${latencyMs}ms).`
          : `Published to "${channel}" successfully, but 0 subscribers are currently listening — this instance is the only one running, or others haven't subscribed to this channel (${latencyMs}ms).`,
      latencyMs,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Replication test failed." };
  } finally {
    conn?.close();
  }
}

// ── Secure Session Storage: at-rest encryption preview ─────────────────────

const ALGO_TO_NODE_CIPHER: Record<EncryptionAlgorithm, string> = {
  "aes-256-gcm": "aes-256-gcm",
  "aes-256-cbc": "aes-256-cbc",
};

/** Derives a 32-byte key from the stored session secret via SHA-256, so
 * an admin can type a memorable passphrase rather than a raw hex key —
 * same approach as most session-signing middleware (e.g. express-session
 * hashes its `secret` internally too). */
function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

/** Encrypts a small sample payload with the configured algorithm and
 * secret — Admin → Cache → Session Cache → Secure Session Storage →
 * "Preview Encryption". Doesn't touch session_store; it's a self-
 * contained round-trip (encrypt then immediately decrypt) that proves
 * the configured secret + algorithm actually work together, the same
 * role Redis Sessions' "Test Connection" plays for that section. */
export function previewSessionEncryption(
  algorithm: EncryptionAlgorithm,
  secret: string,
  sample: string
): { ciphertext: string; iv: string; authTag: string | null; decryptedMatches: boolean } {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(algorithm === "aes-256-gcm" ? 12 : 16);
  const cipher = crypto.createCipheriv(ALGO_TO_NODE_CIPHER[algorithm], key, iv) as crypto.CipherGCM | crypto.Cipher;

  const encrypted = Buffer.concat([cipher.update(sample, "utf8"), cipher.final()]);
  const authTag = algorithm === "aes-256-gcm" ? (cipher as crypto.CipherGCM).getAuthTag() : null;

  // Immediately decrypt to prove the round-trip works with these exact
  // settings, rather than just asserting it would.
  const decipher = crypto.createDecipheriv(ALGO_TO_NODE_CIPHER[algorithm], key, iv) as crypto.DecipherGCM | crypto.Decipher;
  if (authTag) (decipher as crypto.DecipherGCM).setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag ? authTag.toString("base64") : null,
    decryptedMatches: decrypted === sample,
  };
}
