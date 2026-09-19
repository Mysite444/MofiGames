import type { SupabaseClient } from "@supabase/supabase-js";

export interface StorageObjectInfo {
  path: string;
  bytes: number;
  contentType: string | null;
  updatedAt: string | null;
}

export interface StorageBucketInfo {
  id: string;
  public: boolean;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
  objects: StorageObjectInfo[];
  totalBytes: number;
}

// Safety ceiling so a bucket with an enormous number of objects can't
// make the migration export run indefinitely — truncation is reported,
// never silent (see buildMigrationZip's warnings).
const MAX_OBJECTS_PER_BUCKET = 20_000;
const LIST_PAGE_SIZE = 1000;

/** Supabase Storage's `.list()` only returns the direct children of one
 * "folder" prefix at a time (folders are just a naming convention over a
 * flat object namespace) — so a full bucket inventory needs a manual
 * breadth-first walk. Returns `truncated: true` if MAX_OBJECTS_PER_BUCKET
 * was hit before every folder was visited. */
async function listBucketRecursive(
  supabase: SupabaseClient,
  bucketId: string
): Promise<{ objects: StorageObjectInfo[]; truncated: boolean }> {
  const objects: StorageObjectInfo[] = [];
  const queue: string[] = [""];
  let truncated = false;

  while (queue.length > 0 && objects.length < MAX_OBJECTS_PER_BUCKET) {
    const prefix = queue.shift()!;
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(bucketId).list(prefix, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Failed to list storage bucket "${bucketId}": ${error.message}`);
      if (!data || data.length === 0) break;

      for (const entry of data) {
        const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        // Supabase Storage marks folders with id === null (they're a
        // naming convention, not a real object).
        if (entry.id === null) {
          queue.push(fullPath);
        } else {
          objects.push({
            path: fullPath,
            bytes: entry.metadata?.size ?? 0,
            contentType: entry.metadata?.mimetype ?? null,
            updatedAt: entry.updated_at ?? null,
          });
          if (objects.length >= MAX_OBJECTS_PER_BUCKET) {
            truncated = true;
            break;
          }
        }
      }

      offset += LIST_PAGE_SIZE;
      if (data.length < LIST_PAGE_SIZE || truncated) break;
    }
    if (truncated) break;
  }

  return { objects, truncated };
}

/** Full inventory of every Storage bucket and every object in it —
 * config plus per-object path/size/content-type, no binary content. */
export async function getStorageInventory(
  supabase: SupabaseClient
): Promise<{ buckets: StorageBucketInfo[]; warnings: string[] }> {
  const { data: bucketRows, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Failed to list storage buckets: ${error.message}`);

  const buckets: StorageBucketInfo[] = [];
  const warnings: string[] = [];

  for (const b of bucketRows ?? []) {
    const { objects, truncated } = await listBucketRecursive(supabase, b.id);
    if (truncated) {
      warnings.push(`Bucket "${b.id}" has more than ${MAX_OBJECTS_PER_BUCKET.toLocaleString()} objects — inventory truncated at that limit.`);
    }
    buckets.push({
      id: b.id,
      public: b.public,
      fileSizeLimit: b.file_size_limit ?? null,
      allowedMimeTypes: b.allowed_mime_types ?? null,
      objects,
      totalBytes: objects.reduce((sum, o) => sum + o.bytes, 0),
    });
  }

  return { buckets, warnings };
}
