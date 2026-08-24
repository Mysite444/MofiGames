import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobExecutor, JobRunOutcome } from "./types";

// ---------------------------------------------------------------------------
// Shared shape for all three Maintenance jobs: a scan produces a list of
// named checks, each pass/warn/fail with a human-readable detail. The
// Admin → Security → Maintenance page renders `summary.checks` from
// whichever of these three jobs it's showing, generically.
// ---------------------------------------------------------------------------
export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

function summarize(checks: CheckResult[], extra: Record<string, unknown> = {}): JobRunOutcome {
  const failed = checks.filter((c) => c.status === "fail").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  return {
    status: failed > 0 ? "partial" : "success",
    itemsProcessed: checks.length,
    itemsOk: checks.length - failed,
    itemsFailed: failed,
    summary: { checks, failed, warned, ...extra },
  };
}

async function raiseAlertIfNeeded(
  supabase: SupabaseClient,
  type: "health_check_failed" | "vulnerable_dependency" | "integrity_check_failed",
  checks: CheckResult[],
  jobName: string
): Promise<void> {
  const failing = checks.filter((c) => c.status === "fail");
  if (failing.length === 0) return;

  await supabase
    .from("security_alerts")
    .insert({
      type,
      severity: "critical",
      message: `${jobName} found ${failing.length} failing check${failing.length === 1 ? "" : "s"}: ${failing
        .map((c) => c.label)
        .join(", ")}`,
      metadata: { checks: failing },
    })
    .then(undefined, () => {
      // Best-effort — a failure logging its own failure shouldn't mask
      // the scan result itself.
    });
}

// ---------------------------------------------------------------------------
// Security Health Check — a live-ish summary of "current policy gaps"
// (the exact framing from the Phase 1-4 handoff's suggested next step).
// Reads security_settings, access_rules, api_keys, security_alerts, and
// two env vars directly; admin-2FA coverage comes from the
// count_admins_without_mfa() RPC (migration 0021) since auth.mfa_factors
// isn't reachable through PostgREST.
// ---------------------------------------------------------------------------
export const securityHealthCheck: JobExecutor = async (supabase) => {
  const checks: CheckResult[] = [];

  const { data: settingsRow } = await supabase.from("security_settings").select("*").maybeSingle();
  if (!settingsRow) {
    checks.push({
      id: "settings_row",
      label: "Security settings configured",
      status: "fail",
      detail: "No row in security_settings — migration 0017 hasn't been run, or its seed row was deleted.",
    });
  } else {
    const require2fa = Boolean(settingsRow.require_2fa_for_admins);
    const corsOrigins = Array.isArray(settingsRow.api_cors_origins) ? (settingsRow.api_cors_origins as string[]) : [];

    const { data: adminsWithoutMfa } = await supabase.rpc("count_admins_without_mfa");
    const withoutMfaCount = Number(adminsWithoutMfa ?? 0);
    checks.push({
      id: "admins_2fa",
      label: "Admins have two-factor authentication enabled",
      status: withoutMfaCount === 0 ? "pass" : require2fa ? "fail" : "warn",
      detail:
        withoutMfaCount === 0
          ? "Every admin account has a verified TOTP factor."
          : `${withoutMfaCount} admin account${withoutMfaCount === 1 ? "" : "s"} without 2FA enabled` +
            (require2fa
              ? ' — "Require 2FA for admins" is turned on in Settings, but this is not currently enforced at login (see handoff §6.5).'
              : "."),
    });

    checks.push({
      id: "cors_wildcard",
      label: "API CORS is not wide open",
      status: corsOrigins.includes("*") ? "warn" : "pass",
      detail: corsOrigins.includes("*")
        ? "Admin → Security → Settings → API allows any origin ('*') to call /api/v1/*."
        : corsOrigins.length === 0
          ? "No CORS origins configured — /api/v1/* isn't callable from a browser page on another origin."
          : `${corsOrigins.length} origin(s) explicitly allowed.`,
    });

    const weakPassword =
      Number(settingsRow.min_password_length ?? 8) < 8 ||
      (!settingsRow.require_uppercase && !settingsRow.require_number && !settingsRow.require_symbol);
    checks.push({
      id: "password_policy",
      label: "Password policy meets a reasonable minimum",
      status: weakPassword ? "warn" : "pass",
      detail: weakPassword
        ? `Minimum length ${settingsRow.min_password_length}, with few or no character-class requirements.`
        : `Minimum length ${settingsRow.min_password_length}, with character-class requirements enabled.`,
    });
  }

  const { count: accessRuleCount } = await supabase.from("access_rules").select("id", { count: "exact", head: true });
  checks.push({
    id: "access_rules",
    label: "IP/country access rules configured",
    status: (accessRuleCount ?? 0) > 0 ? "pass" : "warn",
    detail:
      (accessRuleCount ?? 0) > 0
        ? `${accessRuleCount} access rule(s) configured.`
        : "No IP or country rules configured yet — this is a valid default, not a bug, just worth knowing.",
  });

  const { count: unresolvedCritical } = await supabase
    .from("security_alerts")
    .select("id", { count: "exact", head: true })
    .eq("resolved", false)
    .eq("severity", "critical");
  checks.push({
    id: "unresolved_alerts",
    label: "No unresolved critical security alerts",
    status: (unresolvedCritical ?? 0) > 0 ? "fail" : "pass",
    detail:
      (unresolvedCritical ?? 0) > 0
        ? `${unresolvedCritical} unresolved critical alert(s) in Admin → Security → Alerts.`
        : "No unresolved critical alerts.",
  });

  const { data: activeKeys } = await supabase
    .from("api_keys")
    .select("id, expires_at")
    .is("revoked_at", null);
  const neverExpiring = (activeKeys ?? []).filter((k) => !k.expires_at).length;
  checks.push({
    id: "api_key_expiry",
    label: "Active API keys have an expiry set",
    status: neverExpiring === 0 ? "pass" : "warn",
    detail:
      neverExpiring === 0
        ? "Every active API key has an expiration date."
        : `${neverExpiring} active API key(s) with no expiration date.`,
  });

  checks.push({
    id: "backup_encryption",
    label: "Backup encryption key configured",
    status: process.env.BACKUP_ENCRYPTION_KEY ? "pass" : "warn",
    detail: process.env.BACKUP_ENCRYPTION_KEY
      ? "BACKUP_ENCRYPTION_KEY is set — scheduled backups are encrypted at rest."
      : "BACKUP_ENCRYPTION_KEY isn't set — scheduled backups are stored as plain JSON (still admin-only via bucket RLS).",
  });

  checks.push({
    id: "cron_secret",
    label: "Scheduled automation is configured to actually run on a timer",
    status: process.env.CRON_SECRET ? "pass" : "warn",
    detail: process.env.CRON_SECRET
      ? "CRON_SECRET is set — an external scheduler can drive /api/cron/automation."
      : "CRON_SECRET isn't set — scheduled jobs (including backups and these Maintenance checks) only run via \"Run now\".",
  });

  await raiseAlertIfNeeded(supabase, "health_check_failed", checks, "Security Health Check");
  return summarize(checks);
};

// ---------------------------------------------------------------------------
// Dependency Security Check — checks every runtime dependency in
// package.json against the npm registry's Bulk Advisory endpoint (the
// same one `npm audit` itself uses as of npm v7+; the older
// audits/quick and audits endpoints were retired in July 2026). Uses
// package-lock.json's resolved (hoisted) version when available for
// accuracy, falling back to the package.json range string otherwise.
// Runtime `dependencies` only — devDependencies never ship to
// production, so they're intentionally out of scope here.
// ---------------------------------------------------------------------------
interface NpmAdvisory {
  id?: number | string;
  url?: string;
  title?: string;
  severity?: string;
  vulnerable_versions?: string;
}

function readJsonIfExists(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export const dependencySecurityCheck: JobExecutor = async (supabase) => {
  const pkg = readJsonIfExists(join(process.cwd(), "package.json"));
  if (!pkg) {
    throw new Error("Couldn't read package.json — is this running from the project root?");
  }
  const lock = readJsonIfExists(join(process.cwd(), "package-lock.json"));
  const lockPackages = (lock?.packages ?? {}) as Record<string, { version?: string }>;

  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  const versions: Record<string, string> = {};
  for (const [name, range] of Object.entries(deps)) {
    const resolved = lockPackages[`node_modules/${name}`]?.version;
    versions[name] = resolved ?? range.replace(/^[\^~>=<\s]+/, "");
  }

  const names = Object.keys(versions);
  const requestBody: Record<string, string[]> = {};
  for (const name of names) requestBody[name] = [versions[name]];

  let advisoriesByPackage: Record<string, NpmAdvisory[]> = {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Registry responded ${res.status}`);
    advisoriesByPackage = await res.json();
  } catch (err) {
    throw new Error(`Couldn't reach the npm advisory registry: ${err instanceof Error ? err.message : "unknown error"}`);
  } finally {
    clearTimeout(timeout);
  }

  const checks: CheckResult[] = [];
  const severityRank: Record<string, number> = { critical: 4, high: 3, moderate: 2, low: 1 };
  const counts: Record<string, number> = { critical: 0, high: 0, moderate: 0, low: 0 };

  for (const name of names) {
    const advisories = advisoriesByPackage[name] ?? [];
    if (advisories.length === 0) {
      checks.push({
        id: name,
        label: name,
        status: "pass",
        detail: `${versions[name]} — no known advisories.`,
      });
      continue;
    }

    const worst = advisories.reduce((a, b) =>
      (severityRank[b.severity ?? ""] ?? 0) > (severityRank[a.severity ?? ""] ?? 0) ? b : a
    );
    const severity = (worst.severity ?? "low").toLowerCase();
    counts[severity] = (counts[severity] ?? 0) + 1;

    checks.push({
      id: name,
      label: name,
      status: severity === "critical" || severity === "high" ? "fail" : "warn",
      detail: `${versions[name]} — ${advisories.length} advisor${advisories.length === 1 ? "y" : "ies"}, worst: ${severity} (${
        worst.title ?? "no title"
      }).`,
    });
  }

  await raiseAlertIfNeeded(supabase, "vulnerable_dependency", checks, "Dependency Security Check");
  return summarize(checks, { packagesChecked: names.length, countsBySeverity: counts, scope: "dependencies (runtime only)" });
};

// ---------------------------------------------------------------------------
// System Integrity Check — confirms every table this project's own
// migrations depend on still exists, still has row-level security
// enabled, and still has at least one policy attached. Backed by the
// system_integrity_report() SECURITY DEFINER RPC (migration 0021),
// since pg_catalog/pg_policies aren't reachable through PostgREST.
// ---------------------------------------------------------------------------
interface IntegrityRow {
  table: string;
  exists: boolean;
  rlsEnabled: boolean;
  policyCount: number;
}

export const systemIntegrityCheck: JobExecutor = async (supabase) => {
  const { data, error } = await supabase.rpc("system_integrity_report");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as IntegrityRow[];
  const checks: CheckResult[] = rows.map((row): CheckResult => {
    if (!row.exists) {
      return { id: row.table, label: row.table, status: "fail", detail: "Table is missing." };
    }
    if (!row.rlsEnabled) {
      return { id: row.table, label: row.table, status: "fail", detail: "Table exists but row-level security is disabled." };
    }
    if (row.policyCount === 0) {
      return {
        id: row.table,
        label: row.table,
        status: "fail",
        detail: "RLS is enabled but no policies are attached — every request will be denied.",
      };
    }
    return { id: row.table, label: row.table, status: "pass", detail: `RLS enabled, ${row.policyCount} polic${row.policyCount === 1 ? "y" : "ies"}.` };
  });

  await raiseAlertIfNeeded(supabase, "integrity_check_failed", checks, "System Integrity Check");
  return summarize(checks, { tablesChecked: rows.length });
};
