import * as net from "node:net";
import {
  connectRedis,
  authAndSelect,
  withTimeout,
  isRespError,
  type RedisConnection,
  type RedisConnOpts,
  type ActionResult,
} from "./redis-protocol";

// Minimal, dependency-free clients used by the live-action API routes
// under src/app/api/admin/cache/object/** (test connection + selective
// invalidation) and, via ./redis-protocol.ts, the equivalent Redis
// Sessions actions under src/app/api/admin/cache/session/**. Deliberately
// not a full driver — just enough RESP2 (Redis, see ./redis-protocol.ts)
// and classic text protocol (Memcached, below) to PING/version, SELECT a
// database, SCAN+DEL a key pattern, and FLUSHDB/flush_all.
//
// Why hand-rolled instead of pulling in ioredis/memcached: this app
// doesn't otherwise talk to either backend (see cache-settings-server.ts —
// the app-level cache that would actually use one of these is still
// "Planned" per the Cache Overview page), so a full client library would
// be dead weight for what amounts to a connectivity test + an eviction
// command. If/when the App-Level Cache phase is built, swap this for a
// real driver.
//
// The RESP2 engine itself (RedisConnection, connect/auth/select) lives in
// ./redis-protocol.ts — Session Cache's Redis Sessions feature needed the
// exact same primitives against a separately-configured connection, so
// it's shared rather than copy-pasted. RedisConnOpts/ActionResult are
// re-exported below for anything still importing them from this module.

export type { RedisConnOpts, ActionResult };

/** Live connection test — Admin → Cache → Object Cache → "Test Connection"
 * (Redis). Connects, authenticates, selects the configured database, and
 * PINGs. */
export async function testRedisConnection(opts: RedisConnOpts): Promise<ActionResult> {
  const start = Date.now();
  let conn: RedisConnection | null = null;
  try {
    conn = await connectRedis(opts.host, opts.port, opts.tls, opts.connectTimeoutMs);
    await authAndSelect(conn, opts);
    const pong = await withTimeout(conn.command(["PING"]), opts.connectTimeoutMs, "PING");
    if (isRespError(pong)) throw new Error(pong.error);
    if (pong !== "PONG") throw new Error(`Unexpected reply to PING: ${JSON.stringify(pong)}`);
    const latencyMs = Date.now() - start;
    return { ok: true, message: `Connected to ${opts.host}:${opts.port} (db ${opts.database}) — PING replied PONG in ${latencyMs}ms.`, latencyMs };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Connection failed." };
  } finally {
    conn?.close();
  }
}

/** Selective Object Invalidation against Redis — either a full FLUSHDB
 * (scoped to the configured database index only, never FLUSHALL) or a
 * SCAN + DEL of everything matching `matchPattern`. */
export async function invalidateRedis(
  opts: RedisConnOpts,
  mode: "all" | "pattern",
  matchPattern?: string
): Promise<ActionResult> {
  let conn: RedisConnection | null = null;
  try {
    conn = await connectRedis(opts.host, opts.port, opts.tls, opts.connectTimeoutMs);
    await authAndSelect(conn, opts);

    if (mode === "all") {
      const reply = await withTimeout(conn.command(["FLUSHDB"]), opts.connectTimeoutMs, "FLUSHDB");
      if (isRespError(reply)) throw new Error(reply.error);
      return { ok: true, message: `FLUSHDB completed on ${opts.host}:${opts.port} database ${opts.database}.` };
    }

    if (!matchPattern) throw new Error("A key pattern is required for pattern-scoped invalidation.");

    let cursor = "0";
    let deleted = 0;
    do {
      const reply = await withTimeout(
        conn.command(["SCAN", cursor, "MATCH", matchPattern, "COUNT", "200"]),
        opts.connectTimeoutMs,
        "SCAN"
      );
      if (isRespError(reply)) throw new Error(reply.error);
      if (!Array.isArray(reply) || reply.length !== 2 || !Array.isArray(reply[1])) {
        throw new Error("Unexpected SCAN reply shape.");
      }
      cursor = String(reply[0]);
      const keys = reply[1].map((k) => String(k));
      if (keys.length > 0) {
        const delReply = await withTimeout(conn.command(["DEL", ...keys]), opts.connectTimeoutMs, "DEL");
        if (!isRespError(delReply)) deleted += Number(delReply) || 0;
      }
    } while (cursor !== "0");

    return {
      ok: true,
      message: `Deleted ${deleted} key${deleted === 1 ? "" : "s"} matching "${matchPattern}".`,
      deletedCount: deleted,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Invalidation failed." };
  } finally {
    conn?.close();
  }
}

// ── Memcached (classic text protocol) ───────────────────────────────────
// Note: SASL auth requires the binary protocol handshake, which isn't
// implemented here — these helpers only speak the unauthenticated
// classic text protocol. See generateMemcachedConfig's comment for why.

function memcachedCommand(host: string, port: number, command: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out talking to ${host}:${port}`));
    }, timeoutMs);

    socket.once("connect", () => socket.write(`${command}\r\n`));
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (buffer.includes("\r\n")) {
        clearTimeout(timer);
        socket.end();
        resolve(buffer.trim());
      }
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function splitServer(server: string): { host: string; port: number } {
  const [host, portStr] = server.split(":");
  return { host: host || "127.0.0.1", port: Number(portStr) || 11211 };
}

/** Live connection test — Admin → Cache → Object Cache → "Test
 * Connection" (Memcached). Sends `version` to each configured server. */
export async function testMemcachedConnection(server: string, timeoutMs: number): Promise<ActionResult> {
  const { host, port } = splitServer(server);
  const start = Date.now();
  try {
    const reply = await memcachedCommand(host, port, "version", timeoutMs);
    if (!reply.toUpperCase().startsWith("VERSION")) throw new Error(`Unexpected reply: ${reply}`);
    const latencyMs = Date.now() - start;
    return { ok: true, message: `${server} — ${reply} (${latencyMs}ms)`, latencyMs };
  } catch (err) {
    return { ok: false, message: `${server}: ${err instanceof Error ? err.message : "connection failed."}` };
  }
}

/** Full flush of one memcached server — the only invalidation the
 * protocol supports without this app tracking keys itself. See
 * generateMemcachedConfig's comment for the "selective by group/pattern"
 * limitation. */
export async function flushMemcached(server: string, timeoutMs: number): Promise<ActionResult> {
  const { host, port } = splitServer(server);
  try {
    const reply = await memcachedCommand(host, port, "flush_all", timeoutMs);
    if (reply.toUpperCase() !== "OK") throw new Error(`Unexpected reply: ${reply}`);
    return { ok: true, message: `${server}: flushed.` };
  } catch (err) {
    return { ok: false, message: `${server}: ${err instanceof Error ? err.message : "flush failed."}` };
  }
}
