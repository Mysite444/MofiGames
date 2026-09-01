"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, LogIn, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { Logo } from "./Logo";
import { GoogleIcon, DiscordIcon } from "./icons/BrandIcons";
import { useAuth, AccountLockedError } from "@/lib/auth-context";

const inputWrapClass =
  "glass input-glow flex items-center gap-2.5 rounded-xl px-3.5 py-2.5";
const inputClass = "w-full bg-transparent text-sm text-white placeholder:text-text-faint focus:outline-none";

function MfaChallengeForm() {
  const { verifyMfaCode, cancelMfaLogin } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await verifyMfaCode(code);
      router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code. Try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-strong flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-menu-yellow)]/15 text-[var(--color-menu-yellow)]">
          <ShieldCheck size={20} />
        </span>
        <p className="text-sm text-white">Enter the 6-digit code from your authenticator app.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">
          {error}
        </p>
      )}

      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        placeholder="000000"
        className="glass input-glow rounded-xl px-3.5 py-3 text-center font-display text-xl tracking-[0.5em] text-white placeholder:text-text-faint focus:outline-none"
      />

      <button
        type="submit"
        disabled={loading || code.length !== 6}
        className="login-cta-glow inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-6 py-3 text-sm font-bold text-white active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
        {loading ? "Verifying…" : "Verify"}
      </button>

      <button
        type="button"
        onClick={() => cancelMfaLogin()}
        className="text-center text-xs font-semibold text-text-faint hover:text-white"
      >
        Cancel and use a different account
      </button>
    </form>
  );
}

export function LoginPageClient() {
  const { user, ready, login, loginAsGuest, loginWithProvider, banNotice, clearBanNotice, mfaFactorId } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "discord" | null>(null);

  // Already signed in (e.g. came back via browser nav) — bounce to the
  // profile page instead of showing the form again.
  useEffect(() => {
    if (ready && user) router.replace("/profile");
  }, [ready, user, router]);

  // /auth/callback redirects back here with ?error=oauth if the
  // Google/Discord handshake didn't complete (denied consent, expired
  // code, etc.) — surface it once, then drop it from the URL so a
  // refresh doesn't keep re-showing it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "oauth") {
      setError("Something went wrong signing you in. Please try again.");
      router.replace("/login");
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      await login(trimmedEmail, password, remember);
      router.push("/profile");
    } catch (err) {
      if (err instanceof AccountLockedError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      }
      setLoading(false);
    }
  }

  async function handleGuest() {
    setError(null);
    setLoading(true);
    try {
      await loginAsGuest();
      router.push("/profile");
    } catch {
      setError("Couldn't start a guest session. Try again.");
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "discord") {
    setError(null);
    setOauthLoading(provider);
    try {
      await loginWithProvider(provider);
      // Success redirects the whole page to the provider's consent
      // screen — nothing further to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start sign-in. Try again.");
      setOauthLoading(null);
    }
  }

  if (mfaFactorId) {
    return (
      <div className="flex flex-col items-center px-4 py-10 sm:py-14 md:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <Logo />
            <div>
              <h1 className="font-display text-2xl font-bold text-white">Two-factor verification</h1>
            </div>
          </div>
          <MfaChallengeForm />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-4 py-10 sm:py-14 md:px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Welcome back</h1>
            <p className="mt-1 text-sm text-text-faint">Log in to pick up right where you left off.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="glass-strong flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
          {banNotice && (
            <div role="alert" className="flex flex-col gap-1 rounded-lg bg-hot/15 px-3 py-2.5 text-xs text-hot">
              <p className="font-semibold">Your account has been suspended.</p>
              <p>{banNotice.reason}</p>
              {banNotice.expiresAt && (
                <p className="text-hot/80">Until {new Date(banNotice.expiresAt).toLocaleString()}.</p>
              )}
              <button
                type="button"
                onClick={clearBanNotice}
                className="mt-1 w-fit font-semibold underline underline-offset-2"
              >
                Dismiss
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">
              {error}
            </p>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">Email</span>
            <div className={inputWrapClass}>
              <Mail size={16} className="shrink-0 text-text-faint" />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">Password</span>
            <div className={inputWrapClass}>
              <Lock size={16} className="shrink-0 text-text-faint" />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="shrink-0 text-text-faint hover:text-white"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 text-text-muted">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-white/30 bg-transparent accent-[var(--color-menu-yellow)]"
              />
              Remember me
            </label>
            <Link href="/forgot-password" className="text-text-faint hover:text-white">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="login-cta-glow mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-6 py-3 text-sm font-bold text-white active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {loading ? "Logging in…" : "Log In"}
          </button>

          <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
            <span className="h-px flex-1 bg-white/10" />
            or
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <button
            type="button"
            onClick={handleGuest}
            disabled={loading}
            className="glass flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold text-white disabled:pointer-events-none disabled:opacity-60"
          >
            <Sparkles size={16} />
            Continue as Guest
          </button>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={loading || oauthLoading !== null}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-60"
            >
              {oauthLoading === "google" ? <Loader2 size={14} className="animate-spin" /> : <GoogleIcon size={14} />}
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuth("discord")}
              disabled={loading || oauthLoading !== null}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-60"
            >
              {oauthLoading === "discord" ? <Loader2 size={14} className="animate-spin" /> : <DiscordIcon size={14} />}
              Continue with Discord
            </button>
          </div>
        </form>

        <p className="mt-5 text-center text-sm text-text-muted">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-white underline underline-offset-2">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
