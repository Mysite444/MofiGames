import * as net from "node:net";
import * as tls from "node:tls";

// Minimal, dependency-free RESP2 (Redis wire protocol) client. Originally
// lived inline in object-cache-client.ts; pulled out here once
// session-cache-client.ts needed the same PING/AUTH/SELECT/PUBLISH
// primitives against a *different* configured connection (Redis Sessions
// has its own host/port/credentials, separate from Object Cache's) — two
// copies of a hand-rolled RESP parser was the wrong amount of duplication
// for what's genuinely the same protocol engine either caller drives.
//
// Still deliberately not a full driver (no pipelining, no RESP3, no
// cluster support) — just enough to PING, AUTH, SELECT, SCAN+DEL,
// FLUSHDB, and PUBLISH. See object-cache-client.ts's own comment for why
// this app doesn't just pull in ioredis: nothing here runs a persistent
// subscriber or connection pool, every caller opens a connection, does
// one short exchange, and closes it.

export type RespValue = string | number | null | RespValue[] | { error: string };

export function isRespError(v: RespValue): v is { error: string } {
  return typeof v === "object" && v !== null && !Array.isArray(v) && "error" in v;
}

function encodeCommand(args: string[]): Buffer {
  const parts = [`*${args.length}\r\n`];
  for (const a of args) {
    parts.push(`$${Buffer.byteLength(a, "utf8")}\r\n${a}\r\n`);
  }
  return Buffer.from(parts.join(""), "utf8");
}

/** Parses one complete RESP value off the front of `buf`. Returns null if
 * `buf` doesn't yet contain a complete value (caller should wait for more
 * data and retry) rather than throwing, so partial TCP reads are handled
 * naturally. */
function parseResp(buf: Buffer): { value: RespValue; rest: Buffer } | null {
  if (buf.length === 0) return null;
  const type = String.fromCharCode(buf[0]);
  const lineEnd = buf.indexOf("\r\n");
  if (lineEnd === -1) return null;
  const line = buf.slice(1, lineEnd).toString("utf8");
  const afterLine = buf.slice(lineEnd + 2);

  switch (type) {
    case "+":
      return { value: line, rest: afterLine };
    case "-":
      return { value: { error: line }, rest: afterLine };
    case ":":
      return { value: Number(line), rest: afterLine };
    case "$": {
      const len = Number(line);
      if (len === -1) return { value: null, rest: afterLine };
      if (afterLine.length < len + 2) return null;
      return { value: afterLine.slice(0, len).toString("utf8"), rest: afterLine.slice(len + 2) };
    }
    case "*": {
      const count = Number(line);
      if (count === -1) return { value: null, rest: afterLine };
      let rest: Buffer = afterLine;
      const arr: RespValue[] = [];
      for (let i = 0; i < count; i++) {
        const sub = parseResp(rest);
        if (!sub) return null;
        arr.push(sub.value);
        rest = sub.rest;
      }
      return { value: arr, rest };
    }
    default:
      throw new Error(`Unexpected RESP reply type byte: ${JSON.stringify(type)}`);
  }
}

export class RedisConnection {
  private buffer: Buffer = Buffer.alloc(0);
  private queue: Array<{ resolve: (v: RespValue) => void; reject: (e: Error) => void }> = [];

  constructor(private socket: net.Socket | tls.TLSSocket) {
    socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
    socket.on("error", (err: Error) => this.rejectAll(err));
    socket.on("close", () => this.rejectAll(new Error("Connection closed unexpectedly.")));
  }

  private rejectAll(err: Error) {
    while (this.queue.length) this.queue.shift()!.reject(err);
  }

  private drain() {
    while (this.queue.length) {
      let parsed;
      try {
        parsed = parseResp(this.buffer);
      } catch (err) {
        this.queue.shift()!.reject(err as Error);
        return;
      }
      if (!parsed) return;
      this.buffer = parsed.rest;
      this.queue.shift()!.resolve(parsed.value);
    }
  }

  command(args: string[]): Promise<RespValue> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.socket.write(encodeCommand(args));
    });
  }

  close() {
    this.socket.destroy();
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

export async function connectRedis(host: string, port: number, useTls: boolean, timeoutMs: number): Promise<RedisConnection> {
  const socket = useTls
    ? tls.connect({ host, port, rejectUnauthorized: false })
    : net.connect({ host, port });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Connection to ${host}:${port} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    socket.once(useTls ? "secureConnect" : "connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  return new RedisConnection(socket);
}

export interface RedisConnOpts {
  host: string;
  port: number;
  database: number;
  tls: boolean;
  username?: string;
  password?: string | null;
  connectTimeoutMs: number;
}

/** AUTH (if a password is configured) and SELECT (if database !== 0) on
 * an already-connected RedisConnection. Shared by every caller (Object
 * Cache's test/invalidate, Session Cache's test/purge-probe/replication)
 * so they all authenticate identically. */
export async function authAndSelect(conn: RedisConnection, opts: RedisConnOpts): Promise<void> {
  if (opts.password) {
    const args = opts.username ? ["AUTH", opts.username, opts.password] : ["AUTH", opts.password];
    const reply = await withTimeout(conn.command(args), opts.connectTimeoutMs, "AUTH");
    if (isRespError(reply)) throw new Error(`AUTH rejected — ${reply.error}`);
  }
  if (opts.database) {
    const reply = await withTimeout(conn.command(["SELECT", String(opts.database)]), opts.connectTimeoutMs, "SELECT");
    if (isRespError(reply)) throw new Error(`SELECT ${opts.database} rejected — ${reply.error}`);
  }
}

export interface ActionResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
  deletedCount?: number;
}
