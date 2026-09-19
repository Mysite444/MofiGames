"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff, Loader2, KeyRound, CheckCircle2, Check, X } from "lucide-react";
import { Logo } from "./Logo";
import { createClient } from "@/lib/supabase/client";
import { checkPasswordStrength, fetchSecuritySettings, DEFAULT_SECURITY_SETTINGS, type SecuritySettings } from "@/lib/security";

const inputWrapClass =
  "glass input-glow flex items-center gap-2.5 rounded-xl px-3.5 py-2.5";
const inputClass = "w-full bg-transparent text-sm text-white placeholder:text-text-faint focus:outline-none";

export function ResetPasswordPageClient() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [ready, setReady] = useState(false);
  const [validLink, setValidLink] = useState(false);
  const [policy, setPolicy] = useState<SecuritySettings>(DEFAULT_SECURITY_SETTINGS);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetchSecuritySettings().then(setPolicy);

    // Clicking the emailed link lands here with Supabase automatically
    // exchanging the recovery token for a session — that session-ready
    // moment is signaled by the PASSWORD_RECOVERY auth event, not just
    // "there's a session" (a person could already be logged in as
    // themselves or someone else in this browser).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setValidLink(true);
        setReady(true);
      }
    });

    // Covers the case where the event already fired before this listener
    // was attached (fast redirect) — if there's already a session by the
    // time this mounts, treat the link as valid rather than showing a
    // false "expired link" error.
    const timeout = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) setValidLink(true);
      setReady(true);
    }, 1500);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [supabase]);

  const strength = checkPasswordStrength(password, policy);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!strength.valid) {
      setError("Password doesn't meet the requirements below.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);

      fetch("/api/account/security-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "password_changed", message: "Password changed via reset link." }),
      }).then(undefined, () => {});

      setDone(true);
      setTimeout(() => router.push("/profile"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center px-4 py-10 sm:py-14 md:px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Set a new password</h1>
            <p className="mt-1 text-sm text-text-faint">Choose something you haven&apos;t used before.</p>
          </div>
        </div>

        {!ready ? (
          <div className="glass-strong flex items-center justify-center rounded-2xl p-10">
            <Loader2 size={20} className="animate-spin text-text-faint" />
          </div>
        ) : done ? (
          <div className="glass-strong flex flex-col items-center gap-3 rounded-2xl p-6 text-center sm:p-7">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 size={20} />
            </span>
            <p className="text-sm text-white">Password updated. Taking you to your profile…</p>
          </div>
        ) : !validLink ? (
          <div className="glass-strong flex flex-col items-center gap-3 rounded-2xl p-6 text-center sm:p-7">
            <p className="text-sm text-white">This reset link is invalid or has expired.</p>
            <Link
              href="/forgot-password"
              className="glow-yellow-button mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-6 py-2.5 text-sm font-bold text-white"
            >
              Request a new link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-strong flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
            {error && (
              <p role="alert" className="rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">
                {error}
              </p>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-muted">New password</span>
              <div className={inputWrapClass}>
                <Lock size={16} className="shrink-0 text-text-faint" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  autoFocus
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

            {password.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs">
                {[
                  { met: password.length >= policy.minPasswordLength, label: `At least ${policy.minPasswordLength} characters` },
                  ...(policy.requireUppercase ? [{ met: /[A-Z]/.test(password), label: "One uppercase letter" }] : []),
                  ...(policy.requireLowercase ? [{ met: /[a-z]/.test(password), label: "One lowercase letter" }] : []),
                  ...(policy.requireNumber ? [{ met: /[0-9]/.test(password), label: "One number" }] : []),
                  ...(policy.requireSymbol ? [{ met: /[^A-Za-z0-9]/.test(password), label: "One symbol" }] : []),
                ].map((rule) => (
                  <li
                    key={rule.label}
                    className={`flex items-center gap-1.5 ${rule.met ? "text-emerald-400" : "text-text-faint"}`}
                  >
                    {rule.met ? <Check size={12} /> : <X size={12} />}
                    {rule.label}
                  </li>
                ))}
              </ul>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-muted">Confirm new password</span>
              <div className={inputWrapClass}>
                <Lock size={16} className="shrink-0 text-text-faint" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="glow-yellow-button mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-6 py-3 text-sm font-bold text-white transition-opacity active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              {loading ? "Updating…" : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
