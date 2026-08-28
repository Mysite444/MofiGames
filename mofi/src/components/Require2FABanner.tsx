"use client";

import { ShieldAlert } from "lucide-react";

/**
 * Shown on /profile?require_2fa=1 when an admin tries to access the admin
 * panel but "Require 2FA for admins" is enabled and their session hasn't
 * been elevated to aal2.  Prompts them to set up TOTP in the Security
 * section below — the MofiGames ProfileSecuritySection already handles
 * the full enrol/verify flow.
 */
export function Require2FABanner() {
  return (
    <div className="mx-auto mb-6 max-w-2xl rounded-xl border border-[var(--color-hot)]/40 bg-[var(--color-hot)]/10 px-5 py-4">
      <div className="flex items-start gap-3">
        <ShieldAlert size={20} className="mt-0.5 shrink-0 text-[var(--color-hot)]" />
        <div>
          <p className="font-semibold text-white">Two-factor authentication required</p>
          <p className="mt-1 text-sm text-white/70">
            Your site requires admins to have two-factor authentication enabled before
            accessing the admin panel. Set up your authenticator app in the{" "}
            <strong className="text-white">Security</strong> section below, then try
            returning to the admin panel.
          </p>
        </div>
      </div>
    </div>
  );
}
