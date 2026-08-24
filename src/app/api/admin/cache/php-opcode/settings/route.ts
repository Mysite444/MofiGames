import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { phpOpcacheSettingsInputSchema } from "@/lib/validation-php-opcode";

/** GET /api/admin/cache/php-opcode/settings
 * Admin-only. Loads the php_opcode_cache_settings singleton row. No
 * credentials are stored here, so no redaction step is required. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("php_opcode_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load PHP OPcache settings." },
      { status: 500 }
    );
  }

  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/admin/cache/php-opcode/settings
 * Admin-only. Validates and merges a partial update into the singleton row. */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = phpOpcacheSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      { error: firstIssue?.message ?? "Validation error." },
      { status: 422 }
    );
  }

  const input = parsed.data;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  // 1. OPcache
  if (input.opcacheEnabled               !== undefined) patch.opcache_enabled                  = input.opcacheEnabled;
  if (input.opcacheMemoryConsumptionMb   !== undefined) patch.opcache_memory_consumption_mb    = input.opcacheMemoryConsumptionMb;
  if (input.opcacheMaxAcceleratedFiles   !== undefined) patch.opcache_max_accelerated_files    = input.opcacheMaxAcceleratedFiles;
  if (input.opcacheMaxWastedPercentage   !== undefined) patch.opcache_max_wasted_percentage    = input.opcacheMaxWastedPercentage;
  if (input.opcacheRevalidateFreqSeconds !== undefined) patch.opcache_revalidate_freq_seconds  = input.opcacheRevalidateFreqSeconds;
  if (input.opcacheSaveComments          !== undefined) patch.opcache_save_comments             = input.opcacheSaveComments;
  if (input.opcacheValidatePermission    !== undefined) patch.opcache_validate_permission       = input.opcacheValidatePermission;
  if (input.opcacheFileCacheEnabled      !== undefined) patch.opcache_file_cache_enabled        = input.opcacheFileCacheEnabled;
  if (input.opcacheFileCachePath         !== undefined) patch.opcache_file_cache_path           = input.opcacheFileCachePath;
  if (input.opcacheFileCacheOnly         !== undefined) patch.opcache_file_cache_only           = input.opcacheFileCacheOnly;

  // 2. JIT
  if (input.jitEnabled              !== undefined) patch.jit_enabled               = input.jitEnabled;
  if (input.jitMode                 !== undefined) patch.jit_mode                  = input.jitMode;
  if (input.jitBufferSizeMb         !== undefined) patch.jit_buffer_size_mb        = input.jitBufferSizeMb;
  if (input.jitHotFunctionThreshold !== undefined) patch.jit_hot_function_threshold = input.jitHotFunctionThreshold;
  if (input.jitMaxRootTraces        !== undefined) patch.jit_max_root_traces        = input.jitMaxRootTraces;

  // 3. Preloading
  if (input.preloadEnabled    !== undefined) patch.preload_enabled     = input.preloadEnabled;
  if (input.preloadScriptPath !== undefined) patch.preload_script_path = input.preloadScriptPath;
  if (input.preloadUser       !== undefined) patch.preload_user        = input.preloadUser;

  // 4. Interned Strings
  if (input.internedStringsBufferMb !== undefined) patch.interned_strings_buffer_mb = input.internedStringsBufferMb;

  const { data, error } = await supabase
    .from("php_opcode_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to save PHP OPcache settings." },
      { status: 500 }
    );
  }

  return NextResponse.json({ settings: data });
}
