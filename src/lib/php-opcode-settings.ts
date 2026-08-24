// Shared between CachePhpOpcacheAdminClient and the API routes under
// src/app/api/admin/cache/php-opcode/**. Mirrors the db-optimization-settings.ts
// pattern — pure mapper, no IO.
//
// Four feature groups:
//   1. OPcache          — memory limits, file cache, revalidation frequency.
//   2. JIT Compilation  — PHP 8+ native-code compiler buffer and mode.
//   3. PHP Preloading   — script preloaded into shared memory at startup.
//   4. Interned Strings — shared immutable string buffer size.

export type JitMode = "off" | "tracing" | "function";
export type OpcacheStatusResult = "success" | "failed" | "unavailable";

export interface PhpOpcacheSettings {
  // ── 1. OPcache ─────────────────────────────────────────────────────────────
  opcacheEnabled: boolean;
  /** Shared-memory segment for compiled scripts, MB. */
  opcacheMemoryConsumptionMb: number;
  /** Maximum number of files OPcache will cache. */
  opcacheMaxAcceleratedFiles: number;
  /** Percentage of wasted memory that triggers a restart. */
  opcacheMaxWastedPercentage: number;
  /** How often to poll for changed files (0 = never revalidate at runtime). */
  opcacheRevalidateFreqSeconds: number;
  /** Preserve doc-comments / attributes in the opcode cache. */
  opcacheSaveComments: boolean;
  /** Validate permissions on each request (minor security vs speed trade-off). */
  opcacheValidatePermission: boolean;
  /** Secondary file-based cache to survive restarts. */
  opcacheFileCacheEnabled: boolean;
  opcacheFileCachePath: string;
  /** Allow file cache to be used without shared-memory OPcache (standalone mode). */
  opcacheFileCacheOnly: boolean;

  // ── 2. JIT Compilation (PHP 8+) ───────────────────────────────────────────
  jitEnabled: boolean;
  /** off | tracing | function — "tracing" offers best real-world gains. */
  jitMode: JitMode;
  /** JIT code buffer, MB. Must be > 0 when JIT is enabled. */
  jitBufferSizeMb: number;
  /**
   * Minimum number of times a function must be called before JIT
   * compiles it (hot-function threshold). 0 = compile everything.
   */
  jitHotFunctionThreshold: number;
  /**
   * Maximum number of root traces before JIT stops adding new ones.
   * Higher values = more coverage, more memory.
   */
  jitMaxRootTraces: number;

  // ── 3. PHP Preloading ─────────────────────────────────────────────────────
  preloadEnabled: boolean;
  /** Absolute server path to the preload bootstrap script. */
  preloadScriptPath: string;
  /**
   * System user that runs the preload phase. Must be the same user as
   * the web-server worker (often "www-data" or "nginx").
   */
  preloadUser: string;

  // ── 4. Interned Strings ───────────────────────────────────────────────────
  /** Buffer for interned strings, MB. Shared across all processes. */
  internedStringsBufferMb: number;

  // ── Diagnostics ───────────────────────────────────────────────────────────
  lastStatusCheckedAt: string | null;
  lastStatusResult: OpcacheStatusResult | null;
  lastStatusMessage: string | null;
  lastResetAt: string | null;

  updatedAt: string;
}

const JIT_MODES: JitMode[] = ["off", "tracing", "function"];

export const DEFAULT_PHP_OPCODE_SETTINGS: PhpOpcacheSettings = {
  opcacheEnabled: true,
  opcacheMemoryConsumptionMb: 128,
  opcacheMaxAcceleratedFiles: 10000,
  opcacheMaxWastedPercentage: 5,
  opcacheRevalidateFreqSeconds: 60,
  opcacheSaveComments: true,
  opcacheValidatePermission: false,
  opcacheFileCacheEnabled: false,
  opcacheFileCachePath: "/tmp/opcache",
  opcacheFileCacheOnly: false,

  jitEnabled: false,
  jitMode: "tracing",
  jitBufferSizeMb: 64,
  jitHotFunctionThreshold: 127,
  jitMaxRootTraces: 1024,

  preloadEnabled: false,
  preloadScriptPath: "",
  preloadUser: "www-data",

  internedStringsBufferMb: 8,

  lastStatusCheckedAt: null,
  lastStatusResult: null,
  lastStatusMessage: null,
  lastResetAt: null,

  updatedAt: new Date(0).toISOString(),
};

export function mapPhpOpcacheRow(
  row: Record<string, unknown> | null
): PhpOpcacheSettings {
  if (!row) return DEFAULT_PHP_OPCODE_SETTINGS;
  const d = DEFAULT_PHP_OPCODE_SETTINGS;

  const jitModeRaw = String(row.jit_mode ?? d.jitMode);
  const jitMode: JitMode = JIT_MODES.includes(jitModeRaw as JitMode)
    ? (jitModeRaw as JitMode)
    : d.jitMode;

  const statusResultRaw = row.last_status_result
    ? String(row.last_status_result)
    : null;
  const lastStatusResult: OpcacheStatusResult | null =
    statusResultRaw &&
    (["success", "failed", "unavailable"] as OpcacheStatusResult[]).includes(
      statusResultRaw as OpcacheStatusResult
    )
      ? (statusResultRaw as OpcacheStatusResult)
      : null;

  return {
    opcacheEnabled: Boolean(row.opcache_enabled ?? d.opcacheEnabled),
    opcacheMemoryConsumptionMb: Math.min(
      1024,
      Math.max(16, Number(row.opcache_memory_consumption_mb ?? d.opcacheMemoryConsumptionMb))
    ),
    opcacheMaxAcceleratedFiles: Math.min(
      1000000,
      Math.max(200, Number(row.opcache_max_accelerated_files ?? d.opcacheMaxAcceleratedFiles))
    ),
    opcacheMaxWastedPercentage: Math.min(
      50,
      Math.max(1, Number(row.opcache_max_wasted_percentage ?? d.opcacheMaxWastedPercentage))
    ),
    opcacheRevalidateFreqSeconds: Math.min(
      3600,
      Math.max(0, Number(row.opcache_revalidate_freq_seconds ?? d.opcacheRevalidateFreqSeconds))
    ),
    opcacheSaveComments: Boolean(row.opcache_save_comments ?? d.opcacheSaveComments),
    opcacheValidatePermission: Boolean(
      row.opcache_validate_permission ?? d.opcacheValidatePermission
    ),
    opcacheFileCacheEnabled: Boolean(
      row.opcache_file_cache_enabled ?? d.opcacheFileCacheEnabled
    ),
    opcacheFileCachePath: String(row.opcache_file_cache_path ?? d.opcacheFileCachePath),
    opcacheFileCacheOnly: Boolean(row.opcache_file_cache_only ?? d.opcacheFileCacheOnly),

    jitEnabled: Boolean(row.jit_enabled ?? d.jitEnabled),
    jitMode,
    jitBufferSizeMb: Math.min(
      512,
      Math.max(8, Number(row.jit_buffer_size_mb ?? d.jitBufferSizeMb))
    ),
    jitHotFunctionThreshold: Math.min(
      4096,
      Math.max(0, Number(row.jit_hot_function_threshold ?? d.jitHotFunctionThreshold))
    ),
    jitMaxRootTraces: Math.min(
      32768,
      Math.max(64, Number(row.jit_max_root_traces ?? d.jitMaxRootTraces))
    ),

    preloadEnabled: Boolean(row.preload_enabled ?? d.preloadEnabled),
    preloadScriptPath: String(row.preload_script_path ?? d.preloadScriptPath),
    preloadUser: String(row.preload_user ?? d.preloadUser),

    internedStringsBufferMb: Math.min(
      512,
      Math.max(4, Number(row.interned_strings_buffer_mb ?? d.internedStringsBufferMb))
    ),

    lastStatusCheckedAt: row.last_status_checked_at
      ? String(row.last_status_checked_at)
      : null,
    lastStatusResult,
    lastStatusMessage: row.last_status_message
      ? String(row.last_status_message)
      : null,
    lastResetAt: row.last_reset_at ? String(row.last_reset_at) : null,

    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}

/**
 * Generates a php.ini / .user.ini snippet covering all four feature groups.
 * Intended to be copied into the server's PHP configuration.
 */
export function generatePhpIniSnippet(s: PhpOpcacheSettings): string {
  const lines: string[] = [
    "; ── OPcache — generated by Mofigames admin panel ──────────────────────",
    `opcache.enable=${s.opcacheEnabled ? "1" : "0"}`,
    `opcache.memory_consumption=${s.opcacheMemoryConsumptionMb}`,
    `opcache.max_accelerated_files=${s.opcacheMaxAcceleratedFiles}`,
    `opcache.max_wasted_percentage=${s.opcacheMaxWastedPercentage}`,
    `opcache.revalidate_freq=${s.opcacheRevalidateFreqSeconds}`,
    `opcache.save_comments=${s.opcacheSaveComments ? "1" : "0"}`,
    `opcache.validate_permission=${s.opcacheValidatePermission ? "1" : "0"}`,
    "",
    "; ── File Cache ─────────────────────────────────────────────────────────",
    `opcache.file_cache_enable=${s.opcacheFileCacheEnabled ? "1" : "0"}`,
  ];

  if (s.opcacheFileCacheEnabled) {
    lines.push(`opcache.file_cache=${s.opcacheFileCachePath}`);
    lines.push(`opcache.file_cache_only=${s.opcacheFileCacheOnly ? "1" : "0"}`);
  }

  lines.push("");
  lines.push("; ── JIT Compilation (PHP 8+) ────────────────────────────────────────────");

  if (!s.jitEnabled || s.jitMode === "off") {
    lines.push("opcache.jit=off");
    lines.push("opcache.jit_buffer_size=0");
  } else {
    lines.push(`opcache.jit=${s.jitMode}`);
    lines.push(`opcache.jit_buffer_size=${s.jitBufferSizeMb}M`);
    lines.push(`opcache.jit_hot_func=${s.jitHotFunctionThreshold}`);
    lines.push(`opcache.jit_max_root_traces=${s.jitMaxRootTraces}`);
  }

  lines.push("");
  lines.push("; ── Preloading ──────────────────────────────────────────────────────────");

  if (s.preloadEnabled && s.preloadScriptPath) {
    lines.push(`opcache.preload=${s.preloadScriptPath}`);
    lines.push(`opcache.preload_user=${s.preloadUser}`);
  } else {
    lines.push("; opcache.preload=          (disabled — set path above and re-save)");
  }

  lines.push("");
  lines.push("; ── Interned Strings ────────────────────────────────────────────────────");
  lines.push(`opcache.interned_strings_buffer=${s.internedStringsBufferMb}`);

  return lines.join("\n");
}

/**
 * Returns a human-readable label for each JIT mode, shown in the UI.
 */
export const JIT_MODE_LABELS: Record<JitMode, { label: string; hint: string }> = {
  off:      { label: "Off",      hint: "JIT disabled (ignored if JIT toggle is on — use the toggle instead)." },
  tracing:  { label: "Tracing",  hint: "Best real-world performance. Traces hot call-paths across function boundaries." },
  function: { label: "Function", hint: "Compiles individual functions. Simpler, slightly lower peak throughput than Tracing." },
};
