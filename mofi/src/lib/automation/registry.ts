import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobExecutor } from "./types";
import {
  scheduledPublishing,
  brokenEmbedChecker,
  autoGameStatusCheck,
  deadLinkScanner,
  autoLinkValidation,
  duplicateGameDetection,
  autoMetadataGeneration,
  autoSlugGeneration,
  autoSeoMetadata,
  autoThumbnailGeneration,
  autoImageOptimization,
  autoWebpConversion,
  scheduledDbCleanup,
  scheduledBackups,
} from "./executors";
import { autoSitemapUpdate, autoCachePurge, autoCdnCachePurge, cachePreload } from "./infra-executors";
import { runAllProviderImports, retryFailedImports } from "./import";
import { securityHealthCheck, dependencySecurityCheck, systemIntegrityCheck } from "./maintenance-executors";

// `email_notifications` has no executor — it's a config-only job (the
// webhook/email target used by notify.ts) rather than something that
// runs on its own. Running it manually is handled as a no-op in run-job.ts.
export const JOB_REGISTRY: Record<string, JobExecutor> = {
  scheduled_publishing: scheduledPublishing,
  auto_import_games: (supabase: SupabaseClient) => runAllProviderImports(supabase),
  auto_retry_failed_imports: (supabase: SupabaseClient) => retryFailedImports(supabase),
  auto_thumbnail_generation: autoThumbnailGeneration,
  auto_image_optimization: autoImageOptimization,
  auto_webp_conversion: autoWebpConversion,
  broken_embed_checker: brokenEmbedChecker,
  dead_link_scanner: deadLinkScanner,
  auto_link_validation: autoLinkValidation,
  auto_game_status_check: autoGameStatusCheck,
  duplicate_game_detection: duplicateGameDetection,
  auto_metadata_generation: autoMetadataGeneration,
  auto_slug_generation: autoSlugGeneration,
  auto_seo_metadata: autoSeoMetadata,
  auto_sitemap_update: autoSitemapUpdate,
  auto_cache_purge: autoCachePurge,
  auto_cdn_cache_purge: autoCdnCachePurge,
  cache_preload: cachePreload,
  scheduled_db_cleanup: scheduledDbCleanup,
  scheduled_backups: scheduledBackups,
  security_health_check: securityHealthCheck,
  dependency_security_check: dependencySecurityCheck,
  system_integrity_check: systemIntegrityCheck,
};
