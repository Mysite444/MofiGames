import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTENT_TABLES, EXCLUDED_TABLE_REASONS, looksLikeInfraTable } from "./content-tables";

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
}

export interface TableForeignKey {
  column: string;
  refTable: string;
  refColumn: string;
}

export interface CatalogTable {
  tableName: string;
  estimatedRows: number;
  primaryKeyColumns: string[];
  columns: TableColumn[];
  foreignKeys: TableForeignKey[];
}

/** Calls the admin_table_catalog() RPC — live introspection of every
 * table actually present in the `public` schema right now, per
 * 0062_backup_migration_system.sql. This is what "inspect the real
 * schema instead of assuming table names from migration files" means in
 * practice: the migration files describe intent, this describes the
 * database as it actually is right now. */
export async function getTableCatalog(supabase: SupabaseClient): Promise<CatalogTable[]> {
  const { data, error } = await supabase.rpc("admin_table_catalog");
  if (error) {
    // Postgres errors raised with `USING DETAIL = ...` / `HINT = ...` carry
    // that in error.details / error.hint — surface it when present so a
    // future mismatch here is diagnosable from the error text alone
    // instead of requiring a code-level investigation like this one.
    const extra = [error.details, error.hint].filter(Boolean).join(" — ");
    throw new Error(`Could not read the database schema catalog: ${error.message}${extra ? ` (${extra})` : ""}`);
  }
  return (data ?? []).map(
    (row: {
      table_name: string;
      estimated_rows: number;
      primary_key_columns: string[] | null;
      columns: TableColumn[] | null;
      foreign_keys: TableForeignKey[] | null;
    }) => ({
      tableName: row.table_name,
      estimatedRows: Number(row.estimated_rows ?? 0),
      primaryKeyColumns: row.primary_key_columns ?? [],
      columns: row.columns ?? [],
      foreignKeys: row.foreign_keys ?? [],
    })
  );
}

export interface ClassifiedCatalog {
  /** Content tables from the registry that actually exist right now,
   * with their live catalog info attached. */
  content: CatalogTable[];
  /** Registry tables that don't currently exist in the schema (renamed
   * or dropped since content-tables.ts was last updated) — surfaced so
   * this doesn't fail silently. */
  missingFromRegistry: string[];
  /** Tables that exist but aren't in the content registry and don't
   * match a known infra naming pattern — genuinely new/unrecognized,
   * not included by default, flagged for the admin to review. */
  needsReview: CatalogTable[];
  /** Everything else: known infra (cache/security/analytics/logs/etc). */
  infra: CatalogTable[];
}

/** Splits the live catalog into content / needs-review / infra using the
 * registry in content-tables.ts. Nothing here decides inclusion by
 * itself — an unrecognized table always lands in `needsReview`, never
 * silently in `content`. */
export function classifyTables(catalog: CatalogTable[]): ClassifiedCatalog {
  const byName = new Map(catalog.map((t) => [t.tableName, t]));
  const content: CatalogTable[] = [];
  const missingFromRegistry: string[] = [];

  for (const name of CONTENT_TABLES) {
    const t = byName.get(name);
    if (t) content.push(t);
    else missingFromRegistry.push(name);
  }

  const contentNames = new Set(CONTENT_TABLES);
  const needsReview: CatalogTable[] = [];
  const infra: CatalogTable[] = [];

  for (const t of catalog) {
    if (contentNames.has(t.tableName)) continue;
    if (t.tableName in EXCLUDED_TABLE_REASONS || looksLikeInfraTable(t.tableName)) {
      infra.push(t);
    } else {
      needsReview.push(t);
    }
  }

  return { content, missingFromRegistry, needsReview, infra };
}

/** Orders `tableNames` so that any table referenced by another table's
 * foreign key (within this same set) comes first — e.g. `games` and
 * `tags` before `game_tags`. Restoring in this order means a chunk never
 * fails purely because the row it points to hasn't been inserted yet.
 *
 * FK edges to tables outside `tableNames` (e.g. `user_id references
 * auth.users`) are ignored here — those aren't something this restore
 * can sequence, see the migration report's Limitations section.
 *
 * Falls back to the input order (with a warning) if a cycle is detected
 * — shouldn't happen for this project's actual schema, but restoring in
 * *some* consistent order beats refusing to restore at all. */
export function topoSortTables(
  tableNames: string[],
  catalog: CatalogTable[]
): { order: string[]; warning?: string } {
  const set = new Set(tableNames);
  const byName = new Map(catalog.map((t) => [t.tableName, t]));

  // edges[a] = tables that must come BEFORE a
  const dependsOn = new Map<string, Set<string>>();
  for (const name of tableNames) dependsOn.set(name, new Set());

  for (const name of tableNames) {
    const table = byName.get(name);
    if (!table) continue;
    for (const fk of table.foreignKeys) {
      if (fk.refTable !== name && set.has(fk.refTable)) {
        dependsOn.get(name)!.add(fk.refTable);
      }
    }
  }

  const order: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  let hadCycle = false;

  function visit(name: string) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      hadCycle = true;
      return;
    }
    visiting.add(name);
    for (const dep of dependsOn.get(name) ?? []) visit(dep);
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  }

  for (const name of tableNames) visit(name);

  if (hadCycle) {
    return {
      order: tableNames,
      warning: "A circular foreign-key dependency was detected among the selected tables; restoring in original order instead of a computed dependency order.",
    };
  }

  return { order };
}
