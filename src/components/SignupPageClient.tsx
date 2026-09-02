"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, Eye, EyeOff, UserPlus, Loader2, Check, X } from "lucide-react";
import { Logo } from "./Logo";
import { GoogleIcon, DiscordIcon } from "./icons/BrandIcons";
import { useAuth, EmailConfirmationRequiredError } from "@/lib/auth-context";
import { checkPasswordStrength, fetchSecuritySettings, DEFAULT_SECURITY_SETTINGS, type SecuritySettings } from "@/lib/security";

const inputWrapClass =
  "glass input-glow flex items-center gap-2.5 rounded-xl px-3.5 py-2.5";
const inputClass = "w-full bg-transparent text-sm text-white placeholder:text-text-faint focus:outline-none";

export function SignupPageClient() {
  const { user, ready, signup, loginWithProvider } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — real users never see or fill this
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "discord" | null>(null);
  const [policy, setPolicy] = useState<SecuritySettings>(DEFAULT_SECURITY_SETTINGS);

  useEffect(() => {
    fetchSecuritySettings().then(setPolicy);
  }, []);

  useEffect(() => {
    if (ready && user) router.replace("/profile");
  }, [ready, user, router]);

  // /auth/callback redirects back here with ?error=oauth if the
  // Google/Discord handshake didn't complete — surface it once, then
  // drop it from the URL so a refresh doesn't keep re-showing it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "oauth") {
      setError("Something went wrong signing you in. Please try again.");
      router.replace("/signup");
    }
  }, [router]);

  const strength = checkPasswordStrength(password, policy);
  const passwordRules = [
    { met: password.length >= policy.minPasswordLength, label: `At least ${policy.minPasswordLength} characters` },
    ...(policy.requireUppercase ? [{ met: /[A-Z]/.test(password), label: "One uppercase letter" }] : []),
    ...(policy.requireLowercase ? [{ met: /[a-z]/.test(password), label: "One lowercase letter" }] : []),
    ...(policy.requireNumber ? [{ met: /[0-9]/.test(password), label: "One number" }] : []),
    ...(policy.requireSymbol ? [{ met: /[^A-Za-z0-9]/.test(password), label: "One symbol" }] : []),
  ];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPendingConfirmation(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    // A real person never sees or fills this field (see the input further
    // down) — anything in it means an automated form-filler. Fail
    // silently-ish, with the same generic error a validation failure
    // would show, so there's nothing distinguishing to learn from.
    if (website.trim().length > 0) {
      setError("Something went wrong. Try again.");
      return;
    }

    if (trimmedName.length < 2) {
      setError("Enter your name.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!strength.valid) {
      setError("Password doesn't meet the requirements below.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!agreed) {
      setError("Please agree to the Terms and Conditions to continue.");
      return;
    }

    setLoading(true);
    try {
      await signup(trimmedName, trimmedEmail, password);
      router.push("/profile");
    } catch (err) {
      if (err instanceof EmailConfirmationRequiredError) {
        setPendingConfirmation(err.message);
        setLoading(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
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

  return (
    <div className="flex flex-col items-center px-4 py-10 sm:py-14 md:px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Create your account</h1>
            <p className="mt-1 text-sm text-text-faint">Save favorites and track your progress — it&apos;s free.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="glass-strong flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
          {/* Honeypot — off-screen, unreachable by tab, and named to
              tempt an automated filler. Any real visitor leaves it
              blank, so a filled value is a reliable bot signal. */}
          <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
            <label>
              Website
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </label>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">
              {error}
            </p>
          )}

          {pendingConfirmation && (
            <p role="status" className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-400">
              {pendingConfirmation}
            </p>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">Display name</span>
            <div className={inputWrapClass}>
              <User size={16} className="shrink-0 text-text-faint" />
              <input
                type="text"
                autoComplete="nickname"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Player"
                className={inputClass}
              />
            </div>
          </label>

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
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`At least ${policy.minPasswordLength} characters`}
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
            <ul className="-mt-2 flex flex-col gap-1 text-xs">
              {passwordRules.map((rule) => (
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
            <span className="text-xs font-semibold text-text-muted">Confirm password</span>
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

          <label className="flex items-start gap-2.5 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-white/30 bg-transparent accent-[var(--color-menu-yellow)]"
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" className="font-semibold text-white underline underline-offset-2">
                Terms and Conditions
              </Link>{" "}
              and{" "}
              <Link href="/privacy-policy" className="font-semibold text-white underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="auth-btn glass mt-1 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white disabled:pointer-events-none disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            {loading ? "Creating account…" : "Create Account"}
          </button>

          <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
            <span className="h-px flex-1 bg-white/10" />
            or
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={loading || oauthLoading !== null}
              className="auth-btn flex flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-2.5 text-xs font-semibold text-white disabled:pointer-events-none disabled:opacity-60"
            >
              {oauthLoading === "google" ? <Loader2 size={14} className="animate-spin" /> : <GoogleIcon size={14} />}
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuth("discord")}
              disabled={loading || oauthLoading !== null}
              className="auth-btn flex flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-2.5 text-xs font-semibold text-white disabled:pointer-events-none disabled:opacity-60"
            >
              {oauthLoading === "discord" ? <Loader2 size={14} className="animate-spin" /> : <DiscordIcon size={14} />}
              Continue with Discord
            </button>
          </div>
        </form>

        <p className="mt-5 text-center text-sm text-text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-white underline underline-offset-2">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
