import path from "node:path";
import { promises as fs } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { CONTENT_TABLES } from "./content-tables";
import { exportContentTables } from "./content-backup";
import { getStorageInventory, type StorageBucketInfo } from "./storage-inventory";
import {
  buildContentBackupManifest,
  getApplicationVersion,
  getDatabaseSchemaVersion,
  getNextVersion,
  getSourceEnvironmentLabel,
  MIGRATION_BACKUP_VERSION,
  type MigrationManifest,
  type StorageBucketSummary,
} from "./manifest";

// Explicit whitelist, not a blacklist — for something that becomes a
// downloadable ZIP, "only ever these paths" is safer than "everything
// except these paths", since a blacklist silently includes anything new
// that shows up later (a stray .env.staging, a debug dump, etc).
const APP_FILE_ENTRIES: { relPath: string; recursive: boolean }[] = [
  { relPath: "src", recursive: true },
  { relPath: "public", recursive: true },
  { relPath: "scripts", recursive: true },
  { relPath: "package.json", recursive: false },
  { relPath: "package-lock.json", recursive: false },
  { relPath: "next.config.ts", recursive: false },
  { relPath: "tsconfig.json", recursive: false },
  { relPath: "postcss.config.mjs", recursive: false },
  { relPath: "eslint.config.mjs", recursive: false },
  { relPath: "next-env.d.ts", recursive: false },
  { relPath: "vercel.json", recursive: false },
  { relPath: ".env.example", recursive: false },
  { relPath: "README.md", recursive: false },
  { relPath: "AGENTS.md", recursive: false },
  { relPath: "CLAUDE.md", recursive: false },
  { relPath: "ADVANCED_SEO_README.md", recursive: false },
  { relPath: "AUTOMATION_SETUP.md", recursive: false },
  { relPath: "RESILIENCE.md", recursive: false },
  { relPath: "SECURITY_HANDOFF.md", recursive: false },
];

// Never include these even if they'd otherwise match a whitelisted
// directory — defense in depth alongside the whitelist above.
const EXCLUDED_SEGMENTS = new Set([
  "node_modules",
  ".next",
  ".git",
  "test-harness", // this project's own local SQL-validation scratch dir, not part of the shipped app
]);
const EXCLUDED_FILENAMES = /^\.env(\..+)?$/; // .env, .env.local, .env.production, etc. Also technically matches ".env.example" — walkDir carves that name back out explicitly below as the one intentional exception (it's added at the top level via APP_FILE_ENTRIES directly, never via walkDir, but the same pattern is kept here too as defense in depth in case a stray .env.example ever lived inside src/public/scripts).

async function walkDir(absDir: string, relBase: string): Promise<{ relPath: string; content: Buffer }[]> {
  const out: { relPath: string; content: Buffer }[] = [];
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDED_SEGMENTS.has(entry.name)) continue;
    const abs = path.join(absDir, entry.name);
    const rel = path.posix.join(relBase, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkDir(abs, rel)));
    } else if (entry.isFile()) {
      if (EXCLUDED_FILENAMES.test(entry.name) && entry.name !== ".env.example") continue;
      out.push({ relPath: rel, content: await fs.readFile(abs) });
    }
  }
  return out;
}

/** Reads the whitelisted application files from disk. Requires the
 * relevant Next.js route to declare these paths via
 * `outputFileTracingIncludes` in next.config.ts — on Vercel, a
 * serverless function's filesystem only contains files Next's build
 * step determined the function actually depends on, and raw source
 * files read via `fs` at runtime (rather than `import`ed) aren't
 * detected by that automatic dependency trace. See next.config.ts. */
export async function collectApplicationFiles(projectRoot: string): Promise<{ relPath: string; content: Buffer }[]> {
  const out: { relPath: string; content: Buffer }[] = [];
  for (const entry of APP_FILE_ENTRIES) {
    const abs = path.join(projectRoot, entry.relPath);
    try {
      const stat = await fs.stat(abs);
      if (stat.isDirectory() && entry.recursive) {
        out.push(...(await walkDir(abs, entry.relPath)));
      } else if (stat.isFile()) {
        out.push({ relPath: entry.relPath, content: await fs.readFile(abs) });
      }
    } catch {
      // Optional docs (e.g. ADVANCED_SEO_README.md) may not exist in
      // every checkout — skip silently, this whitelist entry just
      // doesn't apply here.
    }
  }
  return out;
}

export async function collectSchemaMigrations(projectRoot: string): Promise<{ relPath: string; content: Buffer }[]> {
  const dir = path.join(projectRoot, "supabase", "migrations");
  const files = await fs.readdir(dir);
  const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();
  return Promise.all(
    sqlFiles.map(async (f) => ({
      relPath: `database/schema/${f}`,
      content: await fs.readFile(path.join(dir, f)),
    }))
  );
}

const DEFAULT_MAX_STORAGE_FILES_BYTES = 200 * 1024 * 1024; // 200MB — see README_MIGRATION.md written into the ZIP for the documented alternative above this.

export interface BuildMigrationZipOptions {
  projectRoot: string;
  /** Include actual storage object bytes in the ZIP if the total is
   * under the size threshold. When false, only the storage manifest
   * (bucket config + object listing) is included, plus a
   * ready-to-run export script — same as what happens automatically
   * when the total exceeds the threshold. */
  includeStorageFiles?: boolean;
  maxStorageFilesBytes?: number;
}

export interface BuildMigrationZipResult {
  zipBuffer: Buffer;
  manifest: MigrationManifest;
  warnings: string[];
}

export async function buildMigrationZip(
  supabase: SupabaseClient,
  options: BuildMigrationZipOptions
): Promise<BuildMigrationZipResult> {
  const warnings: string[] = [];
  const zip = new JSZip();

  // 1. Application source.
  const appFiles = await collectApplicationFiles(options.projectRoot);
  for (const f of appFiles) zip.file(f.relPath, f.content);

  // 2. Database schema (raw migration SQL — informational/manual-apply,
  // see the note on schema version mismatches in manifest.ts).
  const schemaFiles = await collectSchemaMigrations(options.projectRoot);
  for (const f of schemaFiles) zip.file(f.relPath, f.content);

  // 3. Database data — the actual current rows, not just the SQL that
  // describes table shape. Reuses the same paginated export as Site
  // Content Backup so there's exactly one code path that knows how to
  // read these tables safely.
  const { file: contentBackup, warnings: exportWarnings } = await exportContentTables(CONTENT_TABLES);
  warnings.push(...exportWarnings);
  for (const [table, rows] of Object.entries(contentBackup.data)) {
    zip.file(`database/data/${table}.json`, JSON.stringify(rows));
  }

  // 4. Storage — always include the manifest/inventory; include actual
  // bytes only if requested and under the size threshold.
  const { buckets, warnings: storageWarnings } = await getStorageInventory(supabase);
  warnings.push(...storageWarnings);
  const totalStorageBytes = buckets.reduce((sum, b) => sum + b.totalBytes, 0);
  const maxBytes = options.maxStorageFilesBytes ?? DEFAULT_MAX_STORAGE_FILES_BYTES;
  const wantsFiles = options.includeStorageFiles !== false;
  const willIncludeFiles = wantsFiles && totalStorageBytes <= maxBytes && buckets.length > 0;

  const bucketSummaries: StorageBucketSummary[] = [];
  for (const bucket of buckets) {
    zip.file(
      `storage/buckets/${bucket.id}.json`,
      JSON.stringify(
        {
          id: bucket.id,
          public: bucket.public,
          fileSizeLimit: bucket.fileSizeLimit,
          allowedMimeTypes: bucket.allowedMimeTypes,
          objects: bucket.objects,
        },
        null,
        2
      )
    );
    bucketSummaries.push({
      id: bucket.id,
      public: bucket.public,
      objectCount: bucket.objects.length,
      totalBytes: bucket.totalBytes,
      filesIncluded: willIncludeFiles,
    });
  }

  if (willIncludeFiles) {
    for (const bucket of buckets) {
      for (const obj of bucket.objects) {
        const { data, error } = await supabase.storage.from(bucket.id).download(obj.path);
        if (error || !data) {
          warnings.push(`Could not download "${bucket.id}/${obj.path}" for the migration ZIP — skipped: ${error?.message ?? "unknown error"}.`);
          continue;
        }
        const buf = Buffer.from(await data.arrayBuffer());
        zip.file(`storage/files/${bucket.id}/${obj.path}`, buf);
      }
    }
  } else if (buckets.length > 0) {
    warnings.push(
      totalStorageBytes > maxBytes
        ? `Storage objects total ${(totalStorageBytes / 1024 / 1024).toFixed(1)}MB, over the ${(maxBytes / 1024 / 1024).toFixed(0)}MB limit for including actual files in the ZIP — only the bucket/object manifest was included. See storage/README.md in the ZIP for how to export the files separately.`
        : `Storage file bytes were not requested for this export — only the bucket/object manifest was included.`
    );
    zip.file(
      "storage/README.md",
      buildStorageInstructions(buckets)
    );
  }

  // 5. Manifest + docs.
  const schemaVersion = await getDatabaseSchemaVersion(schemaFiles.map((f) => path.basename(f.relPath)));
  const manifest: MigrationManifest = {
    backupType: "complete_migration",
    backupVersion: MIGRATION_BACKUP_VERSION,
    applicationVersion: getApplicationVersion(),
    nextVersion: getNextVersion(),
    nodeVersion: process.version,
    databaseSchemaVersion: schemaVersion,
    createdAt: new Date().toISOString(),
    sourceEnvironment: getSourceEnvironmentLabel(),
    includesDatabase: true,
    includesStorage: buckets.length > 0,
    includesStorageFiles: willIncludeFiles,
    includedTables: contentBackup.manifest.tables,
    includedStorageBuckets: bucketSummaries,
    includedAppFiles: appFiles.length > 0,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("README_MIGRATION.md", buildMigrationReadme(manifest));

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });

  return { zipBuffer, manifest, warnings };
}

function buildStorageInstructions(buckets: StorageBucketInfo[]): string {
  const bucketList = buckets.map((b) => `- \`${b.id}\` — ${b.objects.length.toLocaleString()} object(s), ${(b.totalBytes / 1024 / 1024).toFixed(1)}MB`).join("\n");
  return `# Storage files — exported separately

This migration package's ZIP contains the *manifest* for each Storage bucket
(\`storage/buckets/<bucket>.json\` — every object's path, size, and content
type) but not the file bytes themselves, because they were too large (or
weren't requested) to bundle into this ZIP.

Buckets in this project:

${bucketList}

## To move the actual files

Use the Supabase CLI against both projects:

\`\`\`bash
# From the source project
supabase storage cp --recursive supabase://<bucket> ./exported/<bucket>

# Into the destination project
supabase storage cp --recursive ./exported/<bucket> supabase://<bucket>
\`\`\`

or write a small script using \`@supabase/supabase-js\`'s
\`storage.from(bucket).download(path)\` / \`.upload(path, data)\`, driven by the
object list in \`storage/buckets/<bucket>.json\` — that JSON file has
everything such a script needs (paths, and a byte-count to sanity-check the
copy afterward).
`;
}

function buildMigrationReadme(manifest: MigrationManifest): string {
  return `# Complete Site Migration — restore instructions

Generated ${manifest.createdAt} from ${manifest.sourceEnvironment}.

This package has three parts, and **each is restored differently** — there
is no single "run this and it's done" step, because one of the three
(application source) isn't something a running server can safely apply to
itself.

## 1. Application source (\`src/\`, \`public/\`, \`scripts/\`, config files)

Not auto-restored. Deploy this the way you deploy any other change to this
app: commit these files to your destination repo (or a fresh one) and
redeploy through your normal pipeline (e.g. \`git push\` to the branch Vercel
builds from). A running serverless deployment cannot safely overwrite its
own source from an API request, so this step is manual by design, not an
oversight.

## 2. Database schema (\`database/schema/*.sql\`)

Apply these migration files, in filename order, against the destination
Supabase project's SQL Editor (or \`supabase db push\`). They're included for
you to review and run yourself rather than auto-executed on upload, because
the app never runs arbitrary SQL from an uploaded file — see the Security
section of the migration report for why.

## 3. Database data (\`database/data/*.json\`) and storage config

This is what **Admin → Backup & Migration → Complete Site Migration →
Upload** actually restores: it reads \`manifest.json\` and
\`database/data/*.json\` from this ZIP and writes rows into the destination
project's content tables (after you confirm a preview of exactly what will
change), and can create any missing storage buckets from
\`storage/buckets/*.json\`. Run step 2 (schema) against the destination
*before* this step, since the data restore needs the tables to already
exist.

## Environment variables

Copy \`.env.example\` to \`.env.local\` (or your platform's env var settings)
in the destination environment and fill in real values — this package
never contains real secrets, only variable names. See \`SECURITY_HANDOFF.md\`
if present for what each one is for.
`;
}
