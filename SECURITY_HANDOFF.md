# Admin → Security build-out — handoff

Status as of this handoff: **Phases 1–5 shipped, plus an XSS-hardening pass (§9) covering
comments/usernames/bios/reviews. Phase 5 (Maintenance) has not been build/lint/type verified
against a live environment — see §8 for why and what to check first. The §9 work passed
`tsc --noEmit` but not a full `npm run build` — see §9 for why.**
This doc is written so a fresh conversation (with no memory of prior sessions) can pick up
exactly where this one left off — paste it in as the first message.

---

## 0. Before you do anything else

1. **Run the SQL migrations below, in order, in the Supabase SQL Editor**, if you haven't
   already. Each one depends on tables/columns created by the one before it.
2. **Set the new environment variables** (section 2) that apply to features you want live.
3. `npm install && npm run build` to confirm the project still builds clean in your
   environment before making further changes.

---

## 1. Migrations — run order

All in `supabase/migrations/`, already present in the project zip. Run **0017 → 0018 → 0019 → 0020 → 0021**,
in that order, if not already applied. All are idempotent (`if not exists` / `drop policy if exists`
throughout) — safe to re-run.

| # | File | What it adds |
|---|---|---|
| 17 | `0017_security_hardening.sql` | `security_settings` (password policy, lockout, session timeout), `login_attempts`, `security_alerts` |
| 18 | `0018_attack_surface_protection.sql` | **Fixes a real Phase-1 bug** (see §6), `rate_limit_hits` + `hit_rate_limit()`, `access_rules` + `check_access()` (IP/country block/allow) |
| 19 | `0019_api_security.sql` | `api_keys` + `verify_api_key()`, `security_settings.api_cors_origins` |
| 20 | `0020_backup_recovery.sql` | `backup_restores` (restore audit log), extends `security_alerts.type` with `database_restored` / `backup_failed` |
| 21 | `0021_maintenance.sql` | `count_admins_without_mfa()`, `system_integrity_report()` (both SECURITY DEFINER RPCs), extends `security_alerts.type` with `health_check_failed` / `vulnerable_dependency` / `integrity_check_failed`, seeds 3 new `automation_jobs` rows |
| 58 | `0058_profile_bio.sql` | `profiles.bio` column; length-check constraints on `profiles.name` (≤40) and `profiles.bio` (≤300) |
| 59 | `0059_game_reviews.sql` | `game_reviews` table (public 1-5 star + text review, one per user per game) + RLS |

**If asked to verify migration state**: query `select * from public.security_settings;` — if
it returns a row, 0017 is applied. `select * from public.api_keys limit 1;` (even if empty,
no error) confirms 0019. `select * from public.backup_restores limit 1;` confirms 0020.
`select public.system_integrity_report();` (even if it errors on missing tables, not on missing
function) confirms 0021.

---

## 2. Environment variables

All documented with comments in `.env.example`. New ones added during this build-out:

| Var | Required for | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Force-logout-all-devices (self-service and admin), automation cron | Pre-existing var, not new — flagged here because more features now depend on it |
| `CRON_SECRET` | Scheduled automation jobs (incl. daily backups) actually running on a timer | Without it, backups only run via "Run now" in the admin UI |
| `BACKUP_ENCRYPTION_KEY` | Encrypting backup files at rest | Without it, backups are plain JSON in the (still admin-only, RLS-protected) storage bucket |

None of these are required for the app to build or run — every feature gated behind one
degrades to "admin UI shows what's missing" rather than breaking.

---

## 3. Full feature checklist (original ~85-item request)

Legend: ✅ done · 🟡 partial · ⚪ pre-existing (not built by me) · ❌ not started

### Authentication & Access
- ✅ Two-Factor Authentication — Supabase native TOTP MFA, enroll in Profile → Security, challenge on login
- ✅ Password Reset — `/forgot-password` → `/reset-password`
- ✅ Password Hashing — Supabase Auth (bcrypt), nothing to build
- ⚪ Secure Login, RBAC, Session Management — pre-existing
- ✅ Session Timeout — configurable idle auto-logout
- ✅ Device & Active Session Management — partial: existing Sessions page + new self-service "log out everywhere"; no true per-device list (Supabase doesn't expose one)
- ✅ Force Logout from All Devices — self-service (Profile) + admin (existing)
- ✅ Account Lockout — sliding-window, per email
- ✅ Password Strength Policy — configurable, enforced client-side (see §6 limitations)
- 🟡 Email Verification — Supabase supports it; not explicitly configured/wired up

### Login & Monitoring
- ✅ Login Logs, Failed Login Attempts — Admin → Security → Login Logs
- ⚪ Activity Logs, Admin Logs, Audit Trail — pre-existing
- 🟡 User Login History — filterable by email in Login Logs; no dedicated per-user page
- ✅ Security Alerts — Admin → Security → Alerts

### Protection
- ✅ IP Blocking / Allowlist, Country Blocking — Admin → Security → Access Control, enforced in middleware
- ✅ Rate Limiting, Brute Force Protection — generic primitive, applied to login/signup/reset/reports
- ✅ Bot Protection — honeypot fields (signup, forgot-password)
- ❌ CAPTCHA / reCAPTCHA — needs a provider account (Turnstile/reCAPTCHA), not available
- ✅ CSRF Protection — same-origin check, middleware
- ✅ XSS / SQL Injection Protection — structural (React escaping + parameterized Supabase queries) **plus** an explicit sanitization layer added this session for the four user-generated plain-text fields (comments, usernames, profile bios, reviews) — see §10
- ✅ File Upload Validation, File Type Restrictions — Media Library uploads
- ❌ Malware Scanning — needs a third-party scanning API
- ❌ DDoS Protection (Cloudflare) — infra-level, not app code
- ✅ HTTP Request Validation — zod on every mutating route (pre-existing pattern, extended)
- ✅ Security Event Logging — `security_alerts`

### API Security
- ✅ **All done** — see §4 for the new `/api/v1/*` surface this created

### Backup & Recovery
- ✅ **All done** — see §5

### SSL & Security Headers
- ✅ HTTPS Enforcement, HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, CORP
- ❌ COEP — **deliberately not set**, see §6 (would break game iframes)

### File Security
- ✅ Secure Media Uploads, File Type Restrictions — Media Library
- ❌ File Integrity Monitoring, Virus Scanning — needs external service/infra
- ⚪ Secure Storage — Supabase Storage + RLS, pre-existing

### Database Security
- ⚪ Database Encryption, Sensitive Data Encryption — handled by Supabase infra, nothing app-side to add
- 🟡 Encryption Key Management — only in scope for backups (`BACKUP_ENCRYPTION_KEY`); no broader key-management system

### Notifications
- 🟡 New Login Notification, Password Change Notification — **in-app alerts only** (Admin → Security → Alerts), not emails — no email provider configured
- ❌ Admin Action Alerts — not built (would overlap heavily with existing Activity/Audit logs — worth scoping explicitly if wanted)
- ✅ Suspicious Activity Alerts — via security_alerts (lockouts, new logins)
- ✅ Backup Failure Alerts — `backup_failed` alert type

### Maintenance
- ✅ Security Scanner / Security Health Check, Dependency Security Check, System Integrity Check — see §5b
- 🟡 Update Manager, Plugin Security Check — not built; scope was ambiguous (see §5b note) and would need explicit sign-off

---

## 4. What "API Security" actually built (Phase 3)

The project had **no public developer API** before this — every `/api/*` route is internal,
session/cookie-authenticated, called only by the site's own frontend. Rather than bolt
API-key auth onto routes that don't need it, Phase 3 added a **new, separate, opt-in surface**:

- `GET /api/v1/games`, `GET /api/v1/categories` — read-only, published data only
- Auth: `Authorization: Bearer <key>`, scopes `read:games` / `read:categories`
- Admin → Security → API Keys: create/rotate/revoke, per-key rate limit, raw key shown once
- CORS: admin-configurable allowlist (Admin → Security → Settings → API), applies only to `/api/v1/*`

If the intent was instead "add API-key auth to the existing internal API," that's a much larger,
riskier change (breaks the existing session-based frontend) and would need explicit sign-off
before starting.

---

## 5. What "Backup & Recovery" actually built (Phase 4)

**Discovery**: the project already had a working backup pipeline before Phase 4 started —
the `scheduled_backups` automation job (`src/lib/automation/executors.ts`) + the
`automation-backups` storage bucket, both from migration `0016_automation.sql`, predating
this security work entirely. Phase 4 extended it:

- New: **Admin → Security → Backups** — dedicated browse/download/delete UI (previously only
  reachable through the generic Automation Jobs list)
- New: **One-Click Restore** — `POST /api/admin/security/backups/restore`. **Merge semantics**:
  upserts rows back in (update if the row still exists, insert if not) — **never deletes**.
  This means restore cannot undo a deletion by itself. Type-to-confirm UI safeguard.
- New: **Backup Encryption** — AES-256-GCM, opt-in via `BACKUP_ENCRYPTION_KEY`
- Unchanged: scheduling (cron via `automation_jobs.schedule_cron`), manual run, which tables
  get backed up (`games`, `categories`, `tags`, `pages`, `posts` — content tables only, not
  the full database: no `profiles`, `comments`, `login_attempts`, etc. — worth revisiting if
  "full DB backup" was the actual intent)

---

## 5b. What "Maintenance" actually built (Phase 5)

All three ride the existing automation job pattern from Phase 4 rather than new
result tables — `automation_job_runs.summary` (already a per-run jsonb blob) is exactly
"a scan result," so each job's executor just writes its findings there. New Admin →
Security → **Maintenance** page shows all three, reads their last-run summary, and can
trigger any of them via the same generic "Run now" endpoint the Automation dashboard
and Backups page already use. All three also show up in Admin → Automation under a new
`Security` category (distinct from the pre-existing `Maintenance` category that
`scheduled_db_cleanup`/`scheduled_backups` use for general housekeeping).

- **Security Health Check** (`security_health_check`, `src/lib/automation/maintenance-executors.ts`)
  — 8 checks: admins without 2FA (via new `count_admins_without_mfa()` RPC, since
  `auth.mfa_factors` isn't reachable through PostgREST), CORS wildcard, password policy
  strength, access rules configured, unresolved critical alerts, API keys with no
  expiry, `BACKUP_ENCRYPTION_KEY` set, `CRON_SECRET` set. Raises a `health_check_failed`
  security alert if any check fails.
- **Dependency Security Check** (`dependency_security_check`) — reads `package.json`'s
  runtime `dependencies` (devDependencies intentionally out of scope — they don't ship
  to production), resolves versions from `package-lock.json` where available, and POSTs
  to the npm registry's **Bulk Advisory endpoint**
  (`/-/npm/v1/security/advisories/bulk` — the same one `npm audit` itself uses as of
  npm v7+; the older `audits`/`audits/quick` endpoints were retired in July 2026, so
  don't reintroduce those). Raises `vulnerable_dependency` on any critical/high finding.
- **System Integrity Check** (`system_integrity_check`) — calls a new
  `system_integrity_report()` SECURITY DEFINER RPC that checks a fixed list of this
  project's own tables for existence, RLS enabled, and at least one policy attached
  (RLS-enabled-with-zero-policies silently denies all access, which is its own kind of
  breakage). Raises `integrity_check_failed` on any failure.

Scope note on "Update Manager" / "Plugin & Dependency Security Check" from the original
checklist: this is a Next.js app with npm dependencies, not a plugin-based CMS, so
"Update Manager" and "Plugin ... Check" don't map onto anything real here — Dependency
Security Check (above) is the part of that ask that does. Flagged as 🟡 rather than
quietly dropped in case the actual intent was something else (e.g. a changelog/version
banner for the site's own deploys).

---

1. **A real bug was found and fixed mid-build**: Phase 1's lockout/new-login-detection logic
   read `login_attempts` through an unauthenticated (anon) connection, but that table's RLS
   SELECT policy is staff-only — so the count always came back empty and lockout silently
   never triggered. Fixed in migration 0018 via `SECURITY DEFINER` counter functions
   (`count_recent_login_failures`, `count_successful_logins_from_ip`). **If you have a
   deployment that only ran 0017 and not 0018, lockout does not work on it.**

2. **Password policy is enforced client-side only.** Supabase Auth owns the password hash;
   there's no app-controlled table/trigger to enforce it server-side without a Supabase Auth
   Hook (dashboard config, not app code — out of scope here). A determined API caller bypassing
   the UI could set a weak password. Low risk given this is a consumer games site, but flag it
   if requirements tighten.

3. **CSP is deliberately permissive on `frame-src`/`img-src`/`media-src`.** The site's core
   feature is embedding third-party game builds in an iframe from arbitrary, not-known-ahead-of-time
   origins (`src/components/PlayFrame.tsx`) — locking those directives down would break gameplay.
   `script-src`/`style-src` use `'unsafe-inline'` rather than a nonce, because nonce-based CSP
   requires every page to render dynamically (kills static generation/ISR site-wide). Full
   rationale in `next.config.ts` comments.

4. **`Cross-Origin-Embedder-Policy` (COEP) is intentionally not set.** `require-corp` would
   break every cross-origin game iframe whose host doesn't send a matching CORP/CORS header —
   which is most of them, since those are third-party servers outside our control.

5. **"Require 2FA for admins" is a stored setting, not enforced.** It shows in Admin → Security
   → Settings but doesn't yet block login for an admin without a verified TOTP factor. Small,
   well-scoped follow-up if wanted.

6. **In-app notifications, not email.** Every "notification" feature (new login, password
   change, backup failure) surfaces in Admin → Security → Alerts, not as an email to the
   affected user — no email provider is configured. Revisit once one is chosen (Resend, Postmark,
   SES, etc.) — `src/lib/automation/notify.ts` already has a stub for job-failure notifications
   that could be extended to cover this.

7. **Restore is a merge, not a point-in-time revert** — see §5. If "restore = go back to exactly
   how the DB looked at backup time" was the actual requirement, this needs a different
   (destructive, delete-then-insert) implementation with much heavier confirmation.

8. **IP rate limiting / access rules assume a header-based IP** (`x-forwarded-for`) and
   country (`x-vercel-ip-country`, Vercel-specific). Works as-is on Vercel; on another host,
   country blocking silently no-ops (fails open by design) and IP detection may need adjusting
   depending on that host's proxy headers.

---

## 7. File manifest (everything touched/added across Phases 1–5)

**Migrations**: `supabase/migrations/0017_security_hardening.sql` through `0021_maintenance.sql`

**Shared libs**:
`src/lib/security.ts` (client-safe settings/policy), `src/lib/security-server.ts` (server-only
settings fetch), `src/lib/request-ip.ts`, `src/lib/rate-limit.ts`, `src/lib/file-validation.ts`,
`src/lib/api-keys.ts`, `src/lib/api-auth.ts`, `src/lib/backup-crypto.ts`

**Auth flow**: `src/lib/auth-context.tsx` (extended), `src/middleware.ts` (extended),
`src/components/LoginPageClient.tsx`, `SignupPageClient.tsx`, `ForgotPasswordPageClient.tsx`,
`ResetPasswordPageClient.tsx`, `SessionTimeoutManager.tsx`, `ProfileSecuritySection.tsx`

**Public API routes**: `src/app/api/v1/games/route.ts`, `src/app/api/v1/categories/route.ts`

**Auth/account API routes**: `src/app/api/auth/{login-guard,login-log,rate-limit-guard}/route.ts`,
`src/app/api/account/{force-logout,security-event}/route.ts`,
`src/app/api/security/settings/route.ts`

**Admin API routes**: `src/app/api/admin/security/{logs,alerts,access-rules,backups,maintenance}/**`,
`src/app/api/admin/api-keys/**`

**Admin UI**: `src/app/admin/security/{page,logs,alerts,access,api-keys,backups,maintenance}/page.tsx` +
matching `src/components/admin/Security*AdminClient.tsx`, nav entries in `src/app/admin/layout.tsx`

**Config**: `next.config.ts` (security headers), `.env.example` (new vars documented)

**Automation (extended, not created)**: `src/lib/automation/executors.ts` (`scheduledBackups`
— added encryption + failure alerting), `src/lib/automation/registry.ts` (extended),
`src/components/admin/AutomationAdminClient.tsx` (new `Security` category)

**Automation (new, Phase 5)**: `src/lib/automation/maintenance-executors.ts`
(`securityHealthCheck`, `dependencySecurityCheck`, `systemIntegrityCheck`)

---

## 8. Verification status

**Phases 1–4**: last verified clean: `npx tsc --noEmit`, `npx eslint`, `npm run build` — all pass
with zero new errors (one pre-existing, repo-wide ESLint pattern —
`react-hooks/set-state-in-effect` on every admin list client, present before this work started —
is not a regression, confirmed by running it against an untouched file).

**Phase 5**: written this session **without** a build/type-check pass — the working
environment had no `node_modules` and no package-registry network access, so `npm install`,
`npx tsc --noEmit`, `npx eslint`, and `npm run build` could not be run. The code was written
carefully against the same patterns already verified in Phases 1–4 (JobExecutor shape,
SECURITY DEFINER RPC conventions, requireAdmin route guards, existing component styling), and
manually re-read for type correctness, but **run `npx tsc --noEmit` and `npm run build` before
deploying** — treat this as the first thing to do, ahead of anything in §9.

**Not yet done** (all phases): no automated tests exist in this repo (none existed before this
work either), so nothing here has test coverage beyond manual/build/type/lint verification. No
live Supabase project was available to actually exercise the migrations end-to-end — the SQL has
been reviewed carefully but **run it on a staging project first if one exists.**

---

## 9. XSS Hardening — Comments / Usernames / Bios / Reviews (this session)

Requested as item 8 of a feature checklist: "Escape or sanitize: Comments, Usernames, Profile
descriptions, Reviews." Two of those four already existed (comments, usernames); two didn't
(profile descriptions, reviews) and were built from scratch this session, sanitized from the
start rather than bolted on after.

**The actual defense, unchanged**: every one of these fields is rendered as a React text node
(`{value}`, never `dangerouslySetInnerHTML`) — confirmed for comments (public `CommentsSection.tsx`
and admin `CommentsAdminClient.tsx`), usernames (`Avatar.tsx`, `ProfilePageClient.tsx`), and the
two new fields (bio, reviews). React escapes text nodes automatically; that's what actually stops
a stored payload from executing in the browser. Grepped the whole `src/` tree for
`dangerouslySetInnerHTML` — the only three call sites are `RichContent.tsx` (admin-authored rich
HTML for Pages/Blog, already sanitized via `sanitizeContentHtml`, out of scope here — trusted
author, not a visitor), and `JsonLd.tsx`/`SpeculationRules.tsx` (server-built schema objects via
`JSON.stringify`, no user text ever flows into either).

**What was added on top, as defense-in-depth**: `src/lib/sanitize-text.ts`
(`sanitizePlainText`/`sanitizeSingleLineText`) strips HTML tags, `javascript:` URIs, and
control/zero-width characters. Applied via a zod `.transform()` in `src/lib/validation.ts` on
every write path, so a payload can't sit in the database as some future
`dangerouslySetInnerHTML` bug's ammunition, and doesn't leak out through some other surface that
isn't React-escaped (an export, a future RSS/API field, an email digest, etc.).

- **Comments** — `createCommentSchema.body` now runs through `sanitizePlainText` before insert.
  No schema/route changes needed beyond that.
- **Usernames** — real gap found and fixed: `name` was previously written straight from the
  browser to `auth.updateUser()` and the `profiles` table with **no server-side validation at
  all** (`AuthContext.updateProfile`; RLS only guarantees a user can write their *own* row, not
  that what they write is well-formed). Moved to a new route,
  `PATCH /api/account/profile` (`src/app/api/account/profile/route.ts`), validated by
  `updateProfileSchema`. Also sanitized at the original entry point, signup
  (`AuthContext.signup`), and backstopped with a DB `char_length(name) between 1 and 40` check
  constraint (migration 0058).
- **Profile descriptions (bio)** — new field. `profiles.bio` (migration 0058, ≤300 chars, same
  `PATCH /api/account/profile` route). Editable in Account Settings, displayed on the profile
  hero banner, both in `ProfilePageClient.tsx`.
- **Reviews** — new feature. `game_reviews` table (migration 0059): public 1-5 star rating + text,
  one per (user, game), separate from the pre-existing `game_ratings` (star-only, private/self-only
  SELECT policy — left untouched rather than repurposed, to avoid changing an existing feature's
  behavior). `GET/POST/DELETE /api/games/[slug]/reviews`, client store `src/lib/reviews.ts`
  (mirrors `src/lib/comments.ts`'s optimistic-update pattern), UI in
  `src/components/ReviewsSection.tsx`, mounted next to `CommentsSection` on both the desktop
  (`src/app/game/[slug]/page.tsx`) and mobile (`src/components/MobileGamePage.tsx`) game pages.
  No admin moderation UI was built for reviews (comments' moderation UI wasn't extended to cover
  them) — flagged as a follow-up in §10 rather than silently left out.

**Verification**: `npx tsc --noEmit` — clean, zero errors, across the whole project. `npx eslint`
could not run — it fails with a pre-existing, environment-level config error (`TypeError:
Converting circular structure to JSON` in `@eslint/eslintrc`) — confirmed **not** a regression by
running it against an untouched file (`CommentsSection.tsx`), which fails identically. `npm run
build` was not attempted — no live Supabase project was reachable from this environment (only
`registry.npmjs.org`-class domains were network-reachable, not `*.supabase.co`), and this project's
game pages fetch from Supabase at build time for static generation, so a build attempt would fail
for infra reasons unrelated to this change. **Run `npm run build` in an environment with real
Supabase credentials before deploying**, same caveat as Phase 5 in §8.

**Not done / explicitly out of scope**:
- No admin moderation UI for reviews (report/delete-any-review from the admin panel) — comments
  have one (`CommentsAdminClient.tsx`); reviews don't yet.
- No rate limiting on posting reviews — comments have a dedicated one
  (`src/lib/supabase/comment-rate-limit.ts`); reviews rely on the same zod length caps but nothing
  request-frequency-based yet.
- Reviews aren't surfaced in the game page's JSON-LD (`videoGameSchema`) — deliberately, since
  that would be the one place user-generated text meets `dangerouslySetInnerHTML`
  (`JsonLd.tsx`, via `JSON.stringify`) and needs its own careful review before wiring up.

---

## 10. Suggested next steps, in order

1. **Verify Phase 5 builds clean** — see §8. Do this first.
2. **Stragglers**: email verification config, wiring real email delivery once a provider is
   chosen (affects the Notifications category), "Require 2FA for admins" enforcement (the
   Security Health Check now flags this gap explicitly — a natural trigger to finally build it),
   Admin Action Alerts (scope against existing Audit Trail first — may be redundant).
3. **CAPTCHA / malware scanning / DDoS**: blocked on external accounts (Turnstile or reCAPTCHA,
   a malware-scan API, Cloudflare) — revisit once those exist.
4. **Update Manager / Plugin Security Check** — scope this against actual intent (see §5b) before
   building anything; it may already be covered by Dependency Security Check.
5. **Reviews follow-ups** (§9): admin moderation UI (mirror `CommentsAdminClient.tsx`), rate
   limiting on posting (mirror `src/lib/supabase/comment-rate-limit.ts`).

To resume, paste this file into a new conversation along with the project zip.
