// Shared between client (signup/reset-password forms) and server: the
// password policy shape and a pure validation function, so both sides
// agree on what "valid" means. Enforced client-side only (Supabase Auth
// owns the actual password hash — there's no row we control to check it
// server-side without a Supabase Auth Hook, which needs dashboard
// configuration this project doesn't have).

export interface SecuritySettings {
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  maxFailedAttempts: number;
  lockoutWindowMinutes: number;
  sessionTimeoutMinutes: number;
  require2faForAdmins: boolean;
  apiCorsOrigins: string[];
  updatedAt: string;
}

/** Used whenever the `security_settings` row can't be loaded (network
 * hiccup, migration 0017 not yet run) — sensible, moderately strict
 * defaults so the app degrades safely rather than accepting anything. */
export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  minPasswordLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: false,
  maxFailedAttempts: 5,
  lockoutWindowMinutes: 15,
  sessionTimeoutMinutes: 60,
  require2faForAdmins: false,
  apiCorsOrigins: [],
  updatedAt: new Date(0).toISOString(),
};

export interface PasswordCheckResult {
  valid: boolean;
  /** Every unmet requirement, in a fixed order — render as a checklist. */
  issues: string[];
}

/** Pure, synchronous — safe to call on every keystroke for a live
 * checklist as well as on submit. */
export function checkPasswordStrength(password: string, policy: SecuritySettings): PasswordCheckResult {
  const issues: string[] = [];

  if (password.length < policy.minPasswordLength) {
    issues.push(`At least ${policy.minPasswordLength} characters`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    issues.push("One uppercase letter");
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    issues.push("One lowercase letter");
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    issues.push("One number");
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    issues.push("One symbol");
  }

  return { valid: issues.length === 0, issues };
}

/** Row shape returned by GET /api/security/settings (snake_case, as
 * stored) — mapped to the camelCase SecuritySettings above. */
export function mapSecuritySettingsRow(row: Record<string, unknown> | null): SecuritySettings {
  if (!row) return DEFAULT_SECURITY_SETTINGS;
  return {
    minPasswordLength: Number(row.min_password_length ?? DEFAULT_SECURITY_SETTINGS.minPasswordLength),
    requireUppercase: Boolean(row.require_uppercase),
    requireLowercase: Boolean(row.require_lowercase),
    requireNumber: Boolean(row.require_number),
    requireSymbol: Boolean(row.require_symbol),
    maxFailedAttempts: Number(row.max_failed_attempts ?? DEFAULT_SECURITY_SETTINGS.maxFailedAttempts),
    lockoutWindowMinutes: Number(row.lockout_window_minutes ?? DEFAULT_SECURITY_SETTINGS.lockoutWindowMinutes),
    sessionTimeoutMinutes: Number(row.session_timeout_minutes ?? DEFAULT_SECURITY_SETTINGS.sessionTimeoutMinutes),
    require2faForAdmins: Boolean(row.require_2fa_for_admins),
    apiCorsOrigins: Array.isArray(row.api_cors_origins) ? (row.api_cors_origins as string[]) : [],
    updatedAt: String(row.updated_at ?? DEFAULT_SECURITY_SETTINGS.updatedAt),
  };
}

/** Client-side fetch of the (publicly readable) policy row — used by the
 * signup and reset-password forms. Fails soft to the defaults above.
 * Browser-only: relies on a relative URL, which resolves against
 * window.location — see src/lib/security-server.ts for the server-side
 * equivalent (route handlers, Server Components). */
export async function fetchSecuritySettings(): Promise<SecuritySettings> {
  try {
    const res = await fetch("/api/security/settings", { cache: "no-store" });
    if (!res.ok) return DEFAULT_SECURITY_SETTINGS;
    const data = await res.json();
    return mapSecuritySettingsRow(data.settings ?? null);
  } catch {
    return DEFAULT_SECURITY_SETTINGS;
  }
}
