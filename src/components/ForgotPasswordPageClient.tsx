"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Mail, Loader2, ArrowLeft, KeyRound } from "lucide-react";
import { Logo } from "./Logo";
import { createClient } from "@/lib/supabase/client";
import { checkAuthActionAllowed } from "@/lib/auth-context";

const inputWrapClass =
  "glass flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 transition-all focus-within:ring-2 focus-within:ring-white/40";
const inputClass = "w-full bg-transparent text-sm text-white placeholder:text-text-faint focus:outline-none";

export function ForgotPasswordPageClient() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — real users never see or fill this
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    // A real person never sees or fills this field — show the same
    // "check your inbox" success state a bot can't tell apart from a
    // genuine send, rather than a distinguishing rejection.
    if (website.trim().length > 0) {
      setSent(true);
      return;
    }

    setLoading(true);
    try {
      const allowed = await checkAuthActionAllowed("forgot-password", trimmedEmail);
      if (!allowed) {
        setError("Too many reset requests. Try again in a bit.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Deliberately shown even on error (short of a malformed email,
      // already caught above) — confirming or denying whether an email is
      // registered via this form is exactly the kind of thing an
      // account-enumeration attack relies on.
      if (resetError) {
        console.error(resetError);
      }
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center px-4 py-10 sm:py-14 md:px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Reset your password</h1>
            <p className="mt-1 text-sm text-text-faint">
              Enter the email on your account and we&apos;ll send you a reset link.
            </p>
          </div>
        </div>

        {sent ? (
          <div className="glass-strong flex flex-col items-center gap-3 rounded-2xl p-6 text-center sm:p-7">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <KeyRound size={20} />
            </span>
            <p className="text-sm text-white">
              If an account exists for <span className="font-semibold">{email.trim()}</span>, a password reset
              link is on its way.
            </p>
            <p className="text-xs text-text-faint">Check your inbox (and spam folder) for the link.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-strong flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
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

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-muted">Email</span>
              <div className={inputWrapClass}>
                <Mail size={16} className="shrink-0 text-text-faint" />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
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
              {loading ? "Sending…" : "Send Reset Link"}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-text-muted">
          <Link href="/login" className="inline-flex items-center gap-1.5 font-semibold text-white">
            <ArrowLeft size={14} />
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
