"use client";

import { useEffect, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, ShieldOff, Lock, Loader2, Check, X, Smartphone, Monitor } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { checkPasswordStrength, fetchSecuritySettings, DEFAULT_SECURITY_SETTINGS, type SecuritySettings } from "@/lib/security";

type TotpFactor = { id: string; friendly_name?: string | null; status: string };

function logSecurityEvent(type: "password_changed" | "mfa_enabled" | "mfa_disabled", message: string) {
  fetch("/api/account/security-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, message }),
  }).then(undefined, () => {});
}

function TwoFactorSection() {
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(true);
  const [factor, setFactor] = useState<TotpFactor | null>(null);
  const [enrolling, setEnrolling] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp?.find((f) => f.status === "verified") ?? null;
    setFactor(verified);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnroll() {
    setError(null);
    setBusy(true);
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (enrollError) throw new Error(enrollError.message);
      setEnrolling({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start 2FA setup.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll(e: FormEvent) {
    e.preventDefault();
    if (!enrolling) return;
    setError(null);
    setBusy(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrolling.factorId,
      });
      if (challengeError) throw new Error(challengeError.message);

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrolling.factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw new Error(verifyError.message);

      logSecurityEvent("mfa_enabled", "Two-factor authentication was turned on.");
      setEnrolling(null);
      setCode("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!factor) return;
    if (!window.confirm("Turn off two-factor authentication? Your account will only need a password to sign in.")) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) throw new Error(unenrollError.message);
      logSecurityEvent("mfa_disabled", "Two-factor authentication was turned off.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't turn off 2FA.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-faint">
        <Loader2 size={14} className="animate-spin" /> Checking two-factor status…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              factor ? "bg-emerald-500/15 text-emerald-400" : "bg-white/10 text-text-faint"
            }`}
          >
            {factor ? <ShieldCheck size={16} /> : <Smartphone size={16} />}
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Two-factor authentication</p>
            <p className="text-xs text-text-faint">{factor ? "Enabled — via authenticator app" : "Not enabled"}</p>
          </div>
        </div>

        {factor ? (
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="glass flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-hot disabled:opacity-60"
          >
            <ShieldOff size={14} /> Turn off
          </button>
        ) : !enrolling ? (
          <button
            type="button"
            onClick={startEnroll}
            disabled={busy}
            className="glass flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Set up
          </button>
        ) : null}
      </div>

      {error && <p className="rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{error}</p>}

      {enrolling && (
        <form onSubmit={confirmEnroll} className="glass-strong flex flex-col items-center gap-3 rounded-xl p-4">
          <p className="text-center text-xs text-text-faint">
            Scan this with Google Authenticator, Authy, or any TOTP app — or enter the code manually.
          </p>
          <div className="rounded-lg bg-white p-2">
            <QRCodeSVG value={enrolling.qrCode} size={140} />
          </div>
          <code className="rounded bg-white/10 px-2 py-1 text-[11px] text-text-muted">{enrolling.secret}</code>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className="glass input-glow w-full rounded-xl px-3.5 py-2.5 text-center font-display text-lg tracking-[0.4em] text-white placeholder:text-text-faint focus:outline-none"
          />
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => {
                setEnrolling(null);
                setCode("");
                setError(null);
              }}
              className="glass flex-1 rounded-full py-2 text-xs font-semibold text-text-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="glow-yellow-button flex-1 rounded-full bg-[var(--color-menu-bg)] py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Confirm"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ChangePasswordSection({ policy }: { policy: SecuritySettings }) {
  const [supabase] = useState(() => createClient());
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const strength = checkPasswordStrength(password, policy);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!strength.valid) {
      setError("Password doesn't meet the requirements below.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      logSecurityEvent("password_changed", "Password changed from account settings.");
      setSuccess(true);
      setPassword("");
      setConfirm("");
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-text-faint">
            <Lock size={16} />
          </span>
          <p className="text-sm font-semibold text-white">Password</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="glass shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold text-white"
        >
          {open ? "Cancel" : "Change"}
        </button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="glass-strong flex flex-col gap-3 rounded-xl p-4">
          {error && <p className="rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{error}</p>}
          {success ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <Check size={14} /> Password updated.
            </p>
          ) : (
            <>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                className="glass input-glow rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-text-faint focus:outline-none"
              />
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
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm new password"
                className="glass input-glow rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-text-faint focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="glow-yellow-button rounded-full bg-[var(--color-menu-bg)] py-2.5 text-xs font-bold text-white disabled:opacity-60"
              >
                {busy ? "Updating…" : "Update password"}
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}

function DevicesSection() {
  const { forceLogoutAllDevices } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleClick() {
    if (!window.confirm("Sign out everywhere? You'll need to log in again on every device, including this one.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await forceLogoutAllDevices();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log out other devices.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-text-faint">
            <Monitor size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Active sessions</p>
            <p className="text-xs text-text-faint">Signed in on this device and possibly others</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={busy || done}
          className="glass shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold text-hot disabled:opacity-60"
        >
          {busy ? "Signing out…" : "Log out everywhere"}
        </button>
      </div>
      {error && <p className="rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{error}</p>}
    </div>
  );
}

export function ProfileSecuritySection() {
  const [policy, setPolicy] = useState<SecuritySettings>(DEFAULT_SECURITY_SETTINGS);

  useEffect(() => {
    fetchSecuritySettings().then(setPolicy);
  }, []);

  return (
    <section className="glass flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
      <h2 className="font-display text-base font-bold text-white">Security</h2>
      <TwoFactorSection />
      <ChangePasswordSection policy={policy} />
      <DevicesSection />
    </section>
  );
}
