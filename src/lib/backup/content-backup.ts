import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/admin-client";
import { CONTENT_TABLES } from "./content-tables";
import { getTableCatalog, topoSortTables } from "./schema-catalog";
import {
  buildContentBackupManifest,
  validateContentBackupManifest,
  type ContentBackupManifest,
  type TableSummary,
} from "./manifest";

const EXPORT_PAGE_SIZE = 1000;
// Safety ceiling per table so one enormous table can't make a single
// export request run indefinitely — truncation is always reported as a
// warning, never silent. 250k rows of typical content-table width is
// already tens of MB of JSON; a table that size is a sign the export
// window/approach should change, not something to silently paper over.
const MAX_ROWS_PER_TABLE = 250_000;
const RESTORE_CHUNK_SIZE = 500;

export interface ContentBackupFile {
  manifest: ContentBackupManifest;
  data: Record<string, unknown[]>;
}

export interface ContentBackupExportResult {
  file: ContentBackupFile;
  warnings: string[];
}

/** Reads every row of every requested content table, paginated so no
 * single query pulls an entire large table into memory at once.
 *
 * Deliberately uses the SERVICE ROLE client, not the normal RLS-
 * respecting admin session client: `favorites` and `recently_played`
 * (correctly) have row-level policies scoped to `auth.uid() = user_id`
 * with no admin bypass, since there was never a reason for one before
 * this feature existed. Reading through the normal client would not
 * error — it would silently return only the admin's own rows instead of
 * everyone's, which is exactly the kind of quiet under-backup this
 * system exists to avoid. */
export async function exportContentTables(tableNames: string[]): Promise<ContentBackupExportResult> {
  const supabase = getServiceRoleClient();
  if (!supabase) {
    throw new Error(
      "Site Content Backup requires SUPABASE_SERVICE_ROLE_KEY to be configured. Without it, some content tables (favorites, recently_played) have row-level security that would silently return only the current admin's own rows instead of everyone's — so this export refuses to run rather than produce an incomplete backup."
    );
  }
  const catalog = await getTableCatalog(supabase);
  const catalogByName = new Map(catalog.map((t) => [t.tableName, t]));

  const data: Record<string, unknown[]> = {};
  const tables: TableSummary[] = [];
  const warnings: string[] = [];

  for (const name of tableNames) {
    const tableInfo = catalogByName.get(name);
    if (!tableInfo) {
      warnings.push(`Table "${name}" was requested but doesn't exist in the current schema — skipped.`);
      continue;
    }

    // Stable pagination requires an explicit order — .range() alone
    // doesn't guarantee row order across pages in Postgres.
    const orderColumns = tableInfo.primaryKeyColumns.length > 0 ? tableInfo.primaryKeyColumns : null;
    if (!orderColumns) {
      warnings.push(`Table "${name}" has no primary key — skipped (nothing to restore into reliably).`);
      continue;
    }

    const rows: unknown[] = [];
    let from = 0;
    let truncated = false;
    for (;;) {
      let query = supabase.from(name).select("*").range(from, from + EXPORT_PAGE_SIZE - 1);
      for (const col of orderColumns) query = query.order(col, { ascending: true });
      const { data: page, error } = await query;
      if (error) {
        throw new Error(`Failed to read table "${name}": ${error.message}`);
      }
      if (!page || page.length === 0) break;
      rows.push(...page);
      from += EXPORT_PAGE_SIZE;
      if (rows.length >= MAX_ROWS_PER_TABLE) {
        truncated = true;
        break;
      }
      if (page.length < EXPORT_PAGE_SIZE) break;
    }

    if (truncated) {
      warnings.push(`Table "${name}" has more than ${MAX_ROWS_PER_TABLE.toLocaleString()} rows — backup truncated at that limit for this table.`);
    }

    data[name] = rows;
    tables.push({ name, rowCount: rows.length });
  }

  const manifest = buildContentBackupManifest(tables);
  return { file: { manifest, data }, warnings };
}

export class BackupValidationError extends Error {
  errors: string[];
  warnings: string[];
  constructor(errors: string[], warnings: string[] = []) {
    super(errors[0] ?? "Backup validation failed.");
    this.name = "BackupValidationError";
    this.errors = errors;
    this.warnings = warnings;
  }
}

export interface TableRestorePlan {
  table: string;
  rowCount: number;
}

export interface TableRestoreResult extends TableRestorePlan {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: { error: string; row?: unknown }[];
}

export interface RestoreSummary {
  dryRun: boolean;
  order: string[];
  plan: TableRestorePlan[];
  results: TableRestoreResult[];
  warnings: string[];
  totals: { inserted: number; updated: number; skipped: number; failed: number };
  status: "success" | "partial" | "failed";
}

interface RestoreRpcResult {
  inserted?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  errors?: { error: string; row?: unknown }[];
}

/** Parses and structurally validates a candidate content-backup file
 * (from JSON.parse'd upload content) without writing anything — used by
 * both the /validate step (dry preview) and as the first step of
 * /restore itself. */
export function parseAndValidateContentBackup(raw: unknown): {
  manifest: ContentBackupManifest;
  data: Record<string, unknown[]>;
  warnings: string[];
} {
  if (typeof raw !== "object" || raw === null) {
    throw new BackupValidationError(["Backup file is not a valid JSON object."]);
  }
  const { manifest, data } = raw as { manifest?: unknown; data?: unknown };

  const validation = validateContentBackupManifest(manifest, CONTENT_TABLES);
  if (!validation.ok) {
    throw new BackupValidationError(validation.errors, validation.warnings);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new BackupValidationError(["Backup file is missing its data section."], validation.warnings);
  }

  return {
    manifest: manifest as ContentBackupManifest,
    data: data as Record<string, unknown[]>,
    warnings: validation.warnings,
  };
}

/** Builds the restore plan (which tables, in what FK-safe order, how
 * many rows each) without writing anything — this is what powers the
 * "here's exactly what will be restored" confirmation step required
 * before any Content Backup restore. */
export async function planContentRestore(
  supabase: SupabaseClient,
  data: Record<string, unknown[]>,
  requestedTables?: string[]
): Promise<{ order: string[]; plan: TableRestorePlan[]; warnings: string[] }> {
  const warnings: string[] = [];
  const available = requestedTables ?? Object.keys(data);

  const tablesToRestore = available.filter((t) => {
    if (!CONTENT_TABLES.includes(t)) {
      warnings.push(`"${t}" is not a recognized content table — skipped.`);
      return false;
    }
    if (!Array.isArray(data[t])) {
      warnings.push(`"${t}" has no data in this backup — skipped.`);
      return false;
    }
    return true;
  });

  const catalog = await getTableCatalog(supabase);
  const catalogNames = new Set(catalog.map((t) => t.tableName));
  const missing = tablesToRestore.filter((t) => !catalogNames.has(t));
  for (const t of missing) {
    warnings.push(`"${t}" no longer exists in the current database schema — skipped.`);
  }
  const restorable = tablesToRestore.filter((t) => !missing.includes(t));

  const { order, warning } = topoSortTables(restorable, catalog);
  if (warning) warnings.push(warning);

  const plan: TableRestorePlan[] = order.map((table) => ({
    table,
    rowCount: (data[table] ?? []).length,
  }));

  return { order, plan, warnings };
}

/** Executes the restore in FK-safe order, chunked per table, via the
 * `admin_restore_table_rows` RPC (SECURITY DEFINER — bypasses the same
 * per-user RLS that made export need the service-role client, so the
 * normal admin-session client is fine here). Each table's chunks are
 * independent: one table failing doesn't block the others, which is why
 * overall status can be "partial" rather than a strict all-or-nothing
 * across the whole backup — see the migration report for the reasoning. */
export async function restoreContentBackup(
  supabase: SupabaseClient,
  data: Record<string, unknown[]>,
  options: { tables?: string[]; dryRun?: boolean } = {}
): Promise<RestoreSummary> {
  const { order, plan, warnings } = await planContentRestore(supabase, data, options.tables);

  if (options.dryRun) {
    return {
      dryRun: true,
      order,
      plan,
      results: plan.map((p) => ({ ...p, inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [] })),
      warnings,
      totals: { inserted: 0, updated: 0, skipped: 0, failed: 0 },
      status: "success",
    };
  }

  const results: TableRestoreResult[] = [];

  for (const table of order) {
    const rows = data[table] ?? [];
    const result: TableRestoreResult = { table, rowCount: rows.length, inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i += RESTORE_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + RESTORE_CHUNK_SIZE);
      const { data: rpcResult, error } = await supabase.rpc("admin_restore_table_rows", {
        p_table: table,
        p_rows: chunk,
      });
      if (error) {
        result.failed += chunk.length;
        result.errors.push({ error: error.message });
        continue;
      }
      const r = rpcResult as RestoreRpcResult;
      result.inserted += r.inserted ?? 0;
      result.updated += r.updated ?? 0;
      result.skipped += r.skipped ?? 0;
      result.failed += r.failed ?? 0;
      if (r.errors?.length) {
        // Cap accumulated error detail so a very bad restore doesn't
        // build a multi-megabyte response payload.
        const remaining = 100 - result.errors.length;
        if (remaining > 0) result.errors.push(...r.errors.slice(0, remaining));
      }
    }

    results.push(result);
  }

  const totals = results.reduce(
    (acc, r) => ({
      inserted: acc.inserted + r.inserted,
      updated: acc.updated + r.updated,
      skipped: acc.skipped + r.skipped,
      failed: acc.failed + r.failed,
    }),
    { inserted: 0, updated: 0, skipped: 0, failed: 0 }
  );

  const status: RestoreSummary["status"] =
    totals.failed === 0 ? "success" : totals.inserted + totals.updated + totals.skipped > 0 ? "partial" : "failed";

  return { dryRun: false, order, plan, results, warnings, totals, status };
}
