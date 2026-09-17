# MofiGames — Outstanding Security Review Items
*From the 2026-09 security audit (second pass, §23). Updated after third-pass code review.*

Items marked ✅ RESOLVED have been fixed in code and are in the current zip.
Items marked 🔬 NEEDS LIVE TESTING require a running instance and cannot be
verified by static analysis alone.

---

## 1. OAuth / Google callback — open-redirect ✅ RESOLVED

**What was wrong:** The `next` parameter check used `startsWith("/")` only,
which allows `//evil.com` (protocol-relative URL that browsers treat as
`https://evil.com`).

**Fix applied:** `src/app/auth/callback/route.ts` now uses `safeRedirectPath()`
which:
1. Rejects anything that starts with `//`
2. Parses the path with `new URL(raw, origin)` and compares `resolved.origin`
   to the application origin — any off-domain path (including encoded variants)
   fails this check and falls back to `/profile`

**Remaining:** Confirm with a live browser session that:
- `?next=//evil.com` → redirects to `/profile`
- `?next=/profile` → redirects to `/profile` ✓
- `?next=%2F%2Fevil.com` → redirects to `/profile`

---

## 2. Password-reset token lifecycle 🔬 NEEDS LIVE TESTING

**Code status:** Password reset delegates entirely to Supabase Auth.
`supabase.auth.resetPasswordForEmail()` is called in auth-context.tsx.
Supabase default: tokens expire in 1 hour, single-use. No application
code overrides these defaults.

**Tests to run against staging:**
- Request a reset, use the link, try the same link again → must error
- Request a reset, wait >1 hr, use the link → must error  
- Request a reset for an unregistered email → response body must be
  identical to a valid email (no "user not found" enumeration)

---

## 3. Session fixation 🔬 NEEDS LIVE TESTING

**Code status:** Session fixation is handled at two levels:
- `supabase.auth.signInWithPassword()` (now called server-side in
  `/api/auth/login/route.ts`) always issues a brand-new access + refresh
  token pair — the pre-login token is never promoted
- Logout: `supabase.auth.signOut()` invalidates the refresh token on
  Supabase's servers; "Log out all devices" calls
  `admin.auth.admin.signOut(userId, "global")` via service role

**Tests to run:**
- Record `sb-*-auth-token` cookie before and after login — values must differ
- Log out, replay the old token to `GET /api/auth/session-trim` → must 401
- Log out with "all devices", try the session from another tab → must 401

---

## 4. Concurrent admin-action race conditions 🔬 NEEDS LIVE TESTING

**Code status:** All mutations go through Postgres transactions. No application-
level locking exists, but PostgreSQL row-level locks prevent data corruption.
The practical risk is duplicate notifications/emails, not data loss.

**Tests to run (use k6 or Apache Bench):**
```bash
# Fire 50 concurrent publish requests against the same game ID
ab -n 50 -c 50 -m POST \
   -H "Cookie: <admin-session>" \
   https://staging.mofigames.com/api/admin/games/<id>/publish
```
Expected: game ends up in `published` state exactly once. Check `admin_action_logs`
for duplicate entries — those are acceptable (idempotent), data corruption is not.

---

## 5. Production error-page information disclosure ✅ RESOLVED (code audit)

**Code audit result:** All public API routes (`/api/comments`, `/api/contact`,
`/api/reports`, `/api/copyright-requests`, `/api/games/*/rate`, `/api/games/*/reviews`)
return only controlled error strings — no raw `error.message` from Postgres or
Supabase reaches public callers.

Admin routes (`/api/admin/**`) do return Postgres error details in some contexts
(e.g., backup restore `failures` array) — this is intentional diagnostic output
for admins who need it to fix broken backups. All such routes are confirmed
`requireAdmin()`-gated.

The `apiError()` helper (`src/lib/api-error.ts`) logs the full error server-side
and returns only a safe message to the client. It is used on all 500-class paths
reviewed.

**Remaining:** Verify in staging that a deliberate constraint violation on a public
endpoint (e.g., duplicate-slug comment attempt) returns only a human-readable
message with no Postgres detail in the response body.

---

## 6. npm audit / dependency CVE scan ✅ RESOLVED

**Status:** `npm audit --production` reports **0 vulnerabilities** as of:
- Next.js 16.3.5 (CRIT-01 upgrade, first audit)
- isomorphic-dompurify 4.2.0 (M-2, second audit)

Run again after any dependency change: `npm audit && npm outdated`

---

## 7. Live Supabase dashboard RLS verification 🔬 NEEDS LIVE TESTING

Manual SQL edits in the Supabase dashboard can silently override migration files.
Run this in the Supabase SQL editor on the production project:

```sql
-- Verify all tables have RLS enabled
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT tablename FROM pg_policies WHERE schemaname = 'public'
  )
  AND tablename NOT IN (
    SELECT relname FROM pg_class WHERE relrowsecurity = true
  );
-- Expected: 0 rows

-- Verify the open login_attempts INSERT policy was removed (HIGH-01 fix)
SELECT policyname FROM pg_policies
WHERE tablename = 'login_attempts' AND cmd = 'INSERT';
-- Expected: 0 rows (writes now go through record_login_attempt() RPC only)

-- Verify the security_alerts spoofable branch was removed (MED-03 fix)
SELECT policyname, with_check FROM pg_policies
WHERE tablename = 'security_alerts' AND cmd = 'INSERT';
-- Verify: with_check does NOT contain 'account_lockout' without is_admin()

-- Verify the copyright-claims open INSERT is gone (M-1 fix)
SELECT policyname FROM pg_policies
WHERE tablename = 'user_reports'
  AND cmd = 'INSERT'
  AND policyname = 'Anyone can file a copyright claim';
-- Expected: 0 rows

-- Verify the three SECURITY DEFINER RPCs from migration 0078 exist
SELECT proname FROM pg_proc
WHERE proname IN (
  'record_login_attempt',
  'log_security_alert_internal',
  'log_security_alert_self'
);
-- Expected: 3 rows

-- Verify the RPC from migration 0079 exists
SELECT proname FROM pg_proc WHERE proname = 'file_copyright_claim';
-- Expected: 1 row
```

---

*Delete or move this file to a private wiki once all 🔬 items are completed.*
