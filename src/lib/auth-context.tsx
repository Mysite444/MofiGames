"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase/client";
import { sanitizeSingleLineText } from "./sanitize-text";

export interface AuthUser {
  id: string;
  name: string;
  /** "Guest session" for anonymous/guest logins, which have no real email. */
  email: string;
  joinedAt: string; // ISO date
  isAdmin: boolean;
  /** Short public profile description. Lives in public.profiles, not auth
   * user_metadata — hydrated separately, same as isAdmin below. */
  bio: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True once the initial Supabase session check has resolved — guards
   *  against a server/client render mismatch and an auth-state "flash". */
  ready: boolean;
  /** Set right after this session was force-signed-out for being banned —
   * null otherwise. Consumers (e.g. the login page) can surface this as a
   * banner; call clearBanNotice() once shown. */
  banNotice: { reason: string; expiresAt: string | null } | null;
  clearBanNotice: () => void;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  /** Starts the "Continue with Google/Discord" OAuth flow. Redirects the
   * whole page to the provider's consent screen; on success there's
   * nothing further for the caller to do — /auth/callback exchanges the
   * code for a session, and the onAuthStateChange listener above picks
   * it up the same as email/password login. Only throws (without
   * redirecting) if the flow can't even be started, e.g. that provider
   * isn't enabled in Supabase yet. */
  loginWithProvider: (provider: "google" | "discord") => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<AuthUser, "name" | "bio">>) => Promise<void>;
  /** Non-null once a password was correct but the account has a verified
   * TOTP factor and the session hasn't been elevated to aal2 yet — the
   * login form should show a "enter your 6-digit code" step bound to this
   * factor instead of treating the sign-in as complete. */
  mfaFactorId: string | null;
  verifyMfaCode: (code: string) => Promise<void>;
  cancelMfaLogin: () => Promise<void>;
  /** Revokes every active session for this account, everywhere (Profile →
   * Security → "Log out of all devices"). Needs SUPABASE_SERVICE_ROLE_KEY
   * configured server-side. */
  forceLogoutAllDevices: () => Promise<void>;
}

/** Thrown by login() when the account is temporarily locked out from too
 * many recent failed attempts (Admin → Security → Settings). */
export class AccountLockedError extends Error {
  constructor(public retryAfterMinutes: number) {
    super(`Too many failed attempts. Try again in about ${retryAfterMinutes} minute(s).`);
  }
}

/** Best-effort pre-login lockout check — never blocks or fails the actual
 * sign-in attempt if the check itself errors. */
async function checkLoginLockout(email: string): Promise<{ locked: boolean; retryAfterMinutes?: number }> {
  try {
    const res = await fetch("/api/auth/login-guard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return { locked: false };
    return await res.json();
  } catch {
    return { locked: false };
  }
}

/** Shared by signup() and the forgot-password form — both call Supabase
 * Auth directly from the browser with no server route of their own to
 * rate-limit in, so this is the only checkpoint. Fails open on any
 * network error. */
export async function checkAuthActionAllowed(action: "signup" | "forgot-password", email?: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/rate-limit-guard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, email }),
    });
    if (!res.ok) return true;
    const data = await res.json();
    return data.allowed !== false;
  } catch {
    return true;
  }
}

/** Fire-and-forget: records a login attempt (Admin → Security → Login
 * Logs) and lets the server raise a lockout/new-login alert if warranted.
 * Never awaited by callers, never throws outward. */
function logLoginAttempt(email: string, success: boolean, failureReason?: string) {
  fetch("/api/auth/login-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, success, failureReason }),
  }).then(undefined, () => {});
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Thrown by signup() when the account was created but Supabase requires
 * email confirmation before a session is issued. Not really an "error" —
 * callers should show it as a neutral instruction, not a failure.
 */
export class EmailConfirmationRequiredError extends Error {}

function deriveNameFromEmail(email: string): string {
  const handle = email.split("@")[0] ?? "Player";
  const words = handle
    .replace(/[._\-+0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "Player";
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

/** Supabase doesn't return a stable error code for "this email belongs to
 * an existing account" here, just a message — this is a best-effort match
 * on the wording it's used historically, kept loose on purpose so a minor
 * wording change on Supabase's end doesn't silently stop matching. */
function looksLikeEmailAlreadyRegistered(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("already") && (m.includes("regist") || m.includes("exist") || m.includes("use"));
}

function toAuthUser(user: User): AuthUser {
  const isGuest = Boolean(user.is_anonymous) || !user.email;
  const metaName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : undefined;

  return {
    id: user.id,
    name: metaName || (isGuest ? "Guest" : deriveNameFromEmail(user.email ?? "")),
    email: isGuest ? "Guest session" : user.email ?? "",
    joinedAt: user.created_at,
    // is_admin/bio live in public.profiles, not auth user_metadata —
    // hydrated separately below right after this base user is set.
    isAdmin: false,
    bio: "",
  };
}

/** Fire-and-forget: logs a login/signup event to user_activity_logs (see
 * migration 0012). Never awaited by callers and never throws outward — a
 * dropped log entry should never block or fail a real auth action. */
function logAuthActivity(supabase: ReturnType<typeof createClient>, userId: string, activityType: string) {
  supabase
    .from("user_activity_logs")
    .insert({ user_id: userId, activity_type: activityType })
    .then(() => {})
    .then(undefined, () => {});
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [banNotice, setBanNotice] = useState<{ reason: string; expiresAt: string | null } | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncSession(session: import("@supabase/supabase-js").Session | null) {
      if (!session?.user) {
        if (!cancelled) {
          setUser(null);
          setMfaFactorId(null);
          setReady(true);
        }
        return;
      }

      // The password was right and Supabase issued a session, but if this
      // account has a verified TOTP factor the session is only at aal1 —
      // hold off on treating this as "signed in" until a 6-digit code
      // elevates it to aal2. (Note: this gates the *app's* view of the
      // session, not RLS itself — a full defense-in-depth version of this
      // would also add an aal2 check to sensitive RLS policies.)
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== aal.nextLevel) {
        const { data: factorsData } = await supabase.auth.mfa.listFactors();
        const factorId = factorsData?.totp?.find((f) => f.status === "verified")?.id ?? null;
        if (!cancelled) {
          setMfaFactorId(factorId);
          setUser(null);
          setReady(true);
        }
        return;
      }
      setMfaFactorId(null);

      const base = toAuthUser(session.user);
      // is_admin lives in public.profiles, not the auth session — fetch it
      // separately, along with ban status. Fails soft to false/not-banned
      // if the profile row isn't there yet (e.g. the auto-create trigger
      // hasn't run) or the query errors.
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin, is_banned, ban_reason, ban_expires_at, bio")
        .eq("id", session.user.id)
        .maybeSingle();

      // A ban is enforced server-side by RLS regardless (see migration
      // 0012) — this client-side check just gives a banned person an
      // immediate, clear sign-out instead of silently-failing writes.
      // ban_expires_at in the past means the ban has lapsed — not banned.
      const isCurrentlyBanned =
        profile?.is_banned && (!profile.ban_expires_at || new Date(profile.ban_expires_at) > new Date());

      if (isCurrentlyBanned) {
        await supabase.auth.signOut();
        if (!cancelled) {
          setBanNotice({ reason: profile?.ban_reason ?? "Account suspended.", expiresAt: profile?.ban_expires_at ?? null });
          setUser(null);
          setReady(true);
        }
        return;
      }

      if (!cancelled) {
        setUser({ ...base, isAdmin: profile?.is_admin ?? false, bio: profile?.bio ?? "" });
        setReady(true);
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => syncSession(session));

    // Keeps `user` in sync across login, signup, guest login, logout, and
    // token refresh — and across tabs, since Supabase broadcasts these.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSession(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const login = useCallback(
    async (rawEmail: string, password: string, remember = true) => {
      const email = rawEmail.trim().toLowerCase();

      const lockout = await checkLoginLockout(email);
      if (lockout.locked) {
        throw new AccountLockedError(lockout.retryAfterMinutes ?? 15);
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        logLoginAttempt(email, false, error.message);
        throw new Error(error.message);
      }
      logLoginAttempt(email, true);
      if (data.user) logAuthActivity(supabase, data.user.id, "login");

      // When the user did not tick "Remember me", ask the server to cap the
      // auth-cookie MaxAge to security_settings.session_timeout_minutes.
      // Fire-and-forget: a failure here doesn't break the login; the session
      // simply retains the Supabase default lifetime instead of the shorter one.
      if (!remember) {
        fetch("/api/auth/session-trim", { method: "POST", credentials: "include" }).catch(() => {});
      }
    },
    [supabase]
  );

  const signup = useCallback(
    async (rawName: string, rawEmail: string, password: string) => {
      const email = rawEmail.trim().toLowerCase();
      // XSS hardening: this is the original entry point for a display
      // name — sanitize + length-cap it here (mirrors profiles_name_length_check,
      // migration 0058) so nothing unsanitized ever reaches auth
      // user_metadata or the profiles table via signup/guest-linking.
      const name = sanitizeSingleLineText(rawName).slice(0, 40) || "Player";

      const allowed = await checkAuthActionAllowed("signup", email);
      if (!allowed) {
        throw new Error("Too many signup attempts from this connection. Try again later.");
      }

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      // A guest (anonymous) session is already a real, authenticated user
      // row — just one with no email/password yet. Linking an email to it
      // in place (rather than creating a brand-new account via signUp())
      // keeps the same user id, which is what favorites/recently-played/
      // comments are all tied to — so a guest's activity carries over
      // automatically, with nothing to migrate. Requires "manual linking"
      // to be enabled in the Supabase project's Auth settings.
      if (currentSession?.user?.is_anonymous) {
        const { data, error } = await supabase.auth.updateUser({
          email,
          password,
          data: { name },
        });

        if (error) {
          if (looksLikeEmailAlreadyRegistered(error.message)) {
            // This email is a genuinely different, pre-existing account —
            // there's nothing from *this* guest session that belongs to
            // it, so the right move is to sign into that account instead
            // (same as Supabase's own recommended pattern for this case).
            await supabase.auth.signOut();
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) {
              throw new Error(
                "An account with this email already exists. Log in instead, or use a different email."
              );
            }
            return;
          }
          throw new Error(error.message);
        }

        // Keep public.profiles in sync — comments etc. read the display
        // name from there, not from auth metadata.
        if (data.user) {
          await supabase.from("profiles").update({ name }).eq("id", data.user.id);
        }

        // If the project requires email confirmation, the account stays
        // anonymous until the confirmation link is clicked.
        if (data.user?.is_anonymous) {
          throw new EmailConfirmationRequiredError(
            "Almost done! Check your inbox to confirm your email — your favorites, recently played, and comments will carry right over."
          );
        }
        if (data.user) logAuthActivity(supabase, data.user.id, "signup");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw new Error(error.message);

      // If email confirmation is required, Supabase creates the user but
      // returns no session — the caller needs to know this isn't a normal
      // "logged in" success.
      if (!data.session) {
        throw new EmailConfirmationRequiredError(
          "Account created! Check your inbox to confirm your email, then log in."
        );
      }
      if (data.user) logAuthActivity(supabase, data.user.id, "signup");
    },
    [supabase]
  );

  const loginAsGuest = useCallback(async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error(error.message);
    if (data.user) logAuthActivity(supabase, data.user.id, "guest_login");
  }, [supabase]);

  const loginWithProvider = useCallback(
    async (provider: "google" | "discord") => {
      const redirectTo = `${window.location.origin}/auth/callback`;

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      // Mirrors the guest→email linking in signup() above: if this is
      // already a guest (anonymous) session, link the OAuth identity to
      // it in place instead of starting a brand-new account, so
      // favorites/recently-played/comments carry over. Requires "manual
      // linking" to be enabled in the Supabase project's Auth settings
      // (same requirement as the email-linking path above).
      const { error } = currentSession?.user?.is_anonymous
        ? await supabase.auth.linkIdentity({ provider, options: { redirectTo } })
        : await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });

      if (error) throw new Error(error.message);
      // No further action here on success — the browser is already
      // being redirected to the provider's consent screen.
    },
    [supabase]
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, [supabase]);

  const updateProfile = useCallback(async (patch: Partial<Pick<AuthUser, "name" | "bio">>) => {
    const hasName = patch.name !== undefined && patch.name.trim().length > 0;
    const hasBio = patch.bio !== undefined;
    if (!hasName && !hasBio) return;

    // Validated + sanitized server-side (src/lib/validation.ts's
    // updateProfileSchema, src/lib/sanitize-text.ts) — this used to write
    // straight to Supabase from the browser with no server-side checks at
    // all. See src/app/api/account/profile/route.ts.
    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(hasName ? { name: patch.name!.trim() } : {}),
        ...(hasBio ? { bio: patch.bio } : {}),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { name?: string; bio?: string; error?: string };
    if (!res.ok) throw new Error(json.error ?? "Failed to update profile.");

    setUser((prev) =>
      prev
        ? {
            ...prev,
            ...(json.name !== undefined ? { name: json.name } : {}),
            ...(json.bio !== undefined ? { bio: json.bio } : {}),
          }
        : prev
    );
  }, []);

  const clearBanNotice = useCallback(() => setBanNotice(null), []);

  const verifyMfaCode = useCallback(
    async (code: string) => {
      if (!mfaFactorId) throw new Error("No two-factor challenge in progress.");
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: mfaFactorId,
      });
      if (challengeError) throw new Error(challengeError.message);

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw new Error(verifyError.message);
      // onAuthStateChange fires with the now-elevated (aal2) session and
      // syncSession() re-runs, this time setting the user as signed in.
    },
    [supabase, mfaFactorId]
  );

  const cancelMfaLogin = useCallback(async () => {
    await supabase.auth.signOut();
    setMfaFactorId(null);
  }, [supabase]);

  const forceLogoutAllDevices = useCallback(async () => {
    const res = await fetch("/api/account/force-logout", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Couldn't log out other devices.");
    }
    await supabase.auth.signOut();
    setUser(null);
  }, [supabase]);

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        banNotice,
        clearBanNotice,
        login,
        signup,
        loginAsGuest,
        loginWithProvider,
        logout,
        updateProfile,
        mfaFactorId,
        verifyMfaCode,
        cancelMfaLogin,
        forceLogoutAllDevices,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
