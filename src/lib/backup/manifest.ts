import packageJson from "../../../package.json";

/** Bump this when the *shape* of a content backup or migration package
 * changes in a way that would break an older reader (e.g. renaming a
 * manifest field). Restoring a backup with a newer major version than
 * this build understands is refused with a clear error rather than
 * guessed at. */
export const CONTENT_BACKUP_VERSION = 1;
export const MIGRATION_BACKUP_VERSION = 1;

export interface TableSummary {
  name: string;
  rowCount: number;
}

export interface ContentBackupManifest {
  backupType: "site_content_backup";
  backupVersion: number;
  createdAt: string;
  sourceEnvironment: string;
  applicationVersion: string;
  tables: TableSummary[];
}

export interface StorageBucketSummary {
  id: string;
  public: boolean;
  objectCount: number;
  totalBytes: number;
  filesIncluded: boolean;
}

export interface MigrationManifest {
  backupType: "complete_migration";
  backupVersion: number;
  applicationVersion: string;
  nextVersion: string;
  nodeVersion: string;
  databaseSchemaVersion: string;
  createdAt: string;
  sourceEnvironment: string;
  includesDatabase: true;
  includesStorage: boolean;
  includesStorageFiles: boolean;
  includedTables: TableSummary[];
  includedStorageBuckets: StorageBucketSummary[];
  includedAppFiles: boolean;
}

/** Best-effort "which environment did this come from" label — not a
 * secret, just a human hint shown in the restore-summary UI (e.g.
 * "production (mofigames.com)" vs "staging"). Falls back to a generic
 * label rather than throwing if the env var isn't set. */
export function getSourceEnvironmentLabel(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "unknown"
  );
}

export function getApplicationVersion(): string {
  return (packageJson as { version?: string }).version ?? "0.0.0";
}

export function getNextVersion(): string {
  const deps = (packageJson as { dependencies?: Record<string, string> }).dependencies ?? {};
  return deps.next ?? "unknown";
}

/** The database schema version is the highest applied migration file's
 * numeric prefix (e.g. "0062") — read from the actual files on disk
 * rather than hardcoded, so it never drifts from reality. */
export async function getDatabaseSchemaVersion(migrationFilenames: string[]): Promise<string> {
  const numbers = migrationFilenames
    .map((f) => f.match(/^(\d+)_/)?.[1])
    .filter((n): n is string => Boolean(n));
  if (numbers.length === 0) return "unknown";
  return numbers.sort().at(-1) ?? "unknown";
}

export function buildContentBackupManifest(tables: TableSummary[]): ContentBackupManifest {
  return {
    backupType: "site_content_backup",
    backupVersion: CONTENT_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    sourceEnvironment: getSourceEnvironmentLabel(),
    applicationVersion: getApplicationVersion(),
    tables,
  };
}

export interface ManifestValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Validates a content backup's manifest+shape *before* anything is
 * written to the database. Structural/version problems are errors
 * (refuse to restore); anything that's merely different from the
 * current schema (an extra or missing table) is a warning — the actual
 * per-row restore still validates data via the database's own
 * constraints (see admin_restore_table_rows). */
export function validateContentBackupManifest(
  manifest: unknown,
  knownContentTables: string[]
): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof manifest !== "object" || manifest === null) {
    return { ok: false, errors: ["Backup file is missing its manifest."], warnings };
  }
  const m = manifest as Partial<ContentBackupManifest>;

  if (m.backupType !== "site_content_backup") {
    errors.push(
      `This doesn't look like a Site Content Backup file (backup_type: ${String(m.backupType ?? "missing")}). If this is a Complete Migration ZIP, use the Complete Site Migration uploader instead.`
    );
  }
  if (typeof m.backupVersion !== "number") {
    errors.push("Backup file is missing a backup_version.");
  } else if (m.backupVersion > CONTENT_BACKUP_VERSION) {
    errors.push(
      `This backup was created with a newer backup format (v${m.backupVersion}) than this app supports (v${CONTENT_BACKUP_VERSION}). Restore it from an app build that supports that version.`
    );
  } else if (m.backupVersion < CONTENT_BACKUP_VERSION) {
    warnings.push(`Backup format v${m.backupVersion} is older than the current v${CONTENT_BACKUP_VERSION} — restoring anyway, but double-check the results.`);
  }
  if (!Array.isArray(m.tables)) {
    errors.push("Backup file is missing its table list.");
  }
  if (typeof m.createdAt !== "string") {
    warnings.push("Backup file has no creation date recorded.");
  }

  if (errors.length === 0 && Array.isArray(m.tables)) {
    const backedUpNames = new Set(m.tables.map((t) => t.name));
    for (const known of knownContentTables) {
      if (!backedUpNames.has(known)) {
        warnings.push(`"${known}" exists in the current database but isn't in this backup — it will be left untouched.`);
      }
    }
    for (const name of backedUpNames) {
      if (!knownContentTables.includes(name)) {
        warnings.push(`"${name}" is in this backup but isn't a recognized content table in this app build — it will be skipped.`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateMigrationManifest(
  manifest: unknown,
  currentSchemaVersion: string
): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof manifest !== "object" || manifest === null) {
    return { ok: false, errors: ["ZIP is missing manifest.json."], warnings };
  }
  const m = manifest as Partial<MigrationManifest>;

  if (m.backupType !== "complete_migration") {
    errors.push(
      `This doesn't look like a Complete Migration package (backup_type: ${String(m.backupType ?? "missing")}). If this is a Content Backup .json file, use the Site Content Backup uploader instead.`
    );
  }
  if (typeof m.backupVersion !== "number") {
    errors.push("manifest.json is missing a backup_version.");
  } else if (m.backupVersion > MIGRATION_BACKUP_VERSION) {
    errors.push(
      `This package was created with a newer migration format (v${m.backupVersion}) than this app supports (v${MIGRATION_BACKUP_VERSION}).`
    );
  }
  if (!Array.isArray(m.includedTables)) {
    errors.push("manifest.json is missing its included-tables list.");
  }
  if (typeof m.databaseSchemaVersion !== "string") {
    warnings.push("manifest.json has no database schema version recorded.");
  } else if (m.databaseSchemaVersion !== currentSchemaVersion) {
    warnings.push(
      `This package was exported from database schema ${m.databaseSchemaVersion}, but this app is currently on ${currentSchemaVersion}. The application source/schema files in the ZIP are informational for this reason — apply supabase/migrations from the ZIP manually and compare against your destination project before assuming compatibility.`
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}
