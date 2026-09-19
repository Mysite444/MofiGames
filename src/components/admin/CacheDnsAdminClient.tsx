"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Save,
  Check,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Cloud,
  Plus,
  X,
  Unlink,
  ClipboardCopy,
  ClipboardCheck,
  Search,
  Trash2,
  Network,
  Terminal,
  ShieldCheck,
} from "lucide-react";
import {
  mapDnsCacheRow,
  DEFAULT_DNS_CACHE_SETTINGS,
  type DnsCacheSettings,
  type CnameFlatteningMode,
} from "@/lib/dns-cache-settings";
import { mapDnsPrefetchRow, DEFAULT_DNS_PREFETCH_SETTINGS, type DnsPrefetchSettings } from "@/lib/dns-prefetch-settings";
import type { ResolverCacheStats, ResolverCacheEntrySnapshot, ResolverLookupResult } from "@/lib/resolver-cache";

// ── Shared building blocks (mirrors CacheCdnAdminClient's pattern) ──────────

function Section({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">{title}</h2>
        {hint && <p className="mt-1 text-xs text-text-faint">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flex items-center justify-between gap-4 py-1 ${disabled ? "opacity-50" : ""}`}>
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        {hint && <span className="block text-xs text-text-faint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"
        } ${disabled ? "cursor-not-allowed" : ""}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function ChipListField({
  values,
  placeholder,
  onAdd,
  onRemove,
}: {
  values: string[];
  placeholder: string;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const v = draft.trim().toLowerCase();
    if (v && !values.includes(v)) onAdd(v);
    setDraft("");
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80">
            <code>{v}</code>
            <button type="button" onClick={() => onRemove(v)} className="text-white/40 hover:text-white">
              <X size={11} />
            </button>
          </span>
        ))}
        {values.length === 0 && <span className="text-xs text-text-faint">None configured.</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder}
          className="admin-input flex-1 font-mono"
        />
        <button
          type="button"
          onClick={commit}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15"
        >
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      {label && <p className="mb-1 text-xs font-semibold text-text-faint">{label}</p>}
      <pre className="glass overflow-x-auto rounded-xl p-4 text-xs leading-relaxed text-white/80 font-mono whitespace-pre-wrap">{code}</pre>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="absolute right-3 top-3 glass rounded-lg p-1.5 text-text-faint hover:text-white"
      >
        {copied ? <ClipboardCheck size={13} /> : <ClipboardCopy size={13} />}
      </button>
    </div>
  );
}

interface SyncStepResult {
  ok: boolean;
  message: string;
}

function StepRow({ label, result }: { label: string; result?: SyncStepResult }) {
  if (!result) return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-xs">
      <span className="flex shrink-0 items-center gap-1.5 font-semibold text-white/80">
        {result.ok ? <CheckCircle2 size={13} className="text-emerald-400" /> : <XCircle size={13} className="text-hot" />}
        {label}
      </span>
      <span className="text-right text-text-faint">{result.message}</span>
    </div>
  );
}

const CNAME_FLATTENING_OPTIONS: { value: CnameFlatteningMode; label: string; hint: string }[] = [
  {
    value: "flatten_at_root",
    label: "Flatten at root only",
    hint: "CNAMEs at the zone apex (root domain) are flattened — required since a root domain can't have a real CNAME. Subdomain CNAMEs resolve normally.",
  },
  {
    value: "flatten_all",
    label: "Flatten all CNAMEs",
    hint: "Every CNAME record in the zone, including on subdomains, is resolved and served as an A/AAAA record — fewer round trips for clients, at the cost of Cloudflare needing to re-resolve on change.",
  },
];

const OS_FLUSH_COMMANDS: { os: string; command: string }[] = [
  { os: "Windows", command: "ipconfig /flushdns" },
  { os: "macOS", command: "sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder" },
  { os: "Linux (systemd-resolved)", command: "sudo resolvectl flush-caches" },
  { os: "Linux (nscd)", command: "sudo systemctl restart nscd" },
];

/** Admin → Cache → DNS Cache. Four pillars, three different enforcement
 * models:
 *   1. Cloudflare DNS   — real, synced to Cloudflare's API on demand.
 *   2. Browser DNS Cache — real, rendered as <link rel="dns-prefetch"/
 *      preconnect"> tags in the root layout + an X-DNS-Prefetch-Control
 *      response header from middleware.
 *   3. Operating System DNS Cache — nothing this app runs can touch a
 *      visitor's OS resolver cache; this section is reference material
 *      plus a persisted runbook note.
 *   4. Resolver Cache   — a real in-memory cache (src/lib/resolver-cache.ts)
 *      for this server's own outbound DNS lookups.
 * See migration 0042b_dns_cache.sql for why (1)/(3)/(4) and (2) are
 * split across two tables (dns_cache_settings is admin-only because it
 * can hold a live Cloudflare token; dns_prefetch_settings has to be
 * publicly readable because anonymous page loads render from it). */
export function CacheDnsAdminClient() {
  const [dns, setDns] = useState<DnsCacheSettings | null>(null);
  const [prefetch, setPrefetch] = useState<DnsPrefetchSettings | null>(null);
  const [zoneIdDraft, setZoneIdDraft] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<Record<string, SyncStepResult> | null>(null);

  const [resolverStats, setResolverStats] = useState<ResolverCacheStats | null>(null);
  const [resolverEntries, setResolverEntries] = useState<ResolverCacheEntrySnapshot[]>([]);
  const [testHostname, setTestHostname] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ResolverLookupResult | null>(null);
  const [clearing, setClearing] = useState(false);

  function load() {
    fetch("/api/admin/cache/dns/settings")
      .then((res) => res.json())
      .then((data) => {
        const mapped = mapDnsCacheRow(data.settings);
        setDns(mapped);
        setZoneIdDraft(mapped.zoneId);
        setSyncSummary((mapped.lastSyncSummary as Record<string, SyncStepResult> | null) ?? null);
      })
      .catch(() => setDns(DEFAULT_DNS_CACHE_SETTINGS));

    fetch("/api/dns-prefetch/settings")
      .then((res) => res.json())
      .then((data) => setPrefetch(mapDnsPrefetchRow(data.settings)))
      .catch(() => setPrefetch(DEFAULT_DNS_PREFETCH_SETTINGS));

    fetch("/api/admin/cache/dns/resolver")
      .then((res) => res.json())
      .then((data) => {
        setResolverStats(data.stats ?? null);
        setResolverEntries(data.entries ?? []);
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  function patchDns(p: Partial<DnsCacheSettings>) {
    setDns((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }
  function patchPrefetch(p: Partial<DnsPrefetchSettings>) {
    setPrefetch((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }

  async function save() {
    if (!dns || !prefetch) return;
    setSaving(true);
    setError(null);
    try {
      const dnsBody: Record<string, unknown> = {
        zoneId: zoneIdDraft,
        dnssecEnabled: dns.dnssecEnabled,
        cnameFlatteningMode: dns.cnameFlatteningMode,
        resolverCacheEnabled: dns.resolverCacheEnabled,
        resolverCacheMinTtlSeconds: dns.resolverCacheMinTtlSeconds,
        resolverCacheMaxTtlSeconds: dns.resolverCacheMaxTtlSeconds,
        resolverCacheMaxEntries: dns.resolverCacheMaxEntries,
        osDnsRunbookNotes: dns.osDnsRunbookNotes,
      };
      if (tokenDraft.trim()) dnsBody.apiToken = tokenDraft.trim();

      const prefetchBody = {
        dnsPrefetchControlEnabled: prefetch.dnsPrefetchControlEnabled,
        dnsPrefetchDomains: prefetch.dnsPrefetchDomains,
        preconnectDomains: prefetch.preconnectDomains,
      };

      const [dnsRes, prefetchRes] = await Promise.all([
        fetch("/api/admin/cache/dns/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dnsBody),
        }),
        fetch("/api/dns-prefetch/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(prefetchBody),
        }),
      ]);
      const dnsData = await dnsRes.json();
      const prefetchData = await prefetchRes.json();
      if (!dnsRes.ok) throw new Error(dnsData.error ?? "Failed to save Cloudflare/Resolver/OS settings.");
      if (!prefetchRes.ok) throw new Error(prefetchData.error ?? "Failed to save Browser DNS Cache settings.");

      setDns(mapDnsCacheRow(dnsData.settings));
      setPrefetch(mapDnsPrefetchRow(prefetchData.settings));
      setTokenDraft("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Cloudflare? This clears the stored Zone ID and API Token.")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cache/dns/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearCredentials: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to disconnect.");
      setDns(mapDnsCacheRow(data.settings));
      setZoneIdDraft("");
      setTokenDraft("");
      setSyncSummary(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/admin/cache/dns/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed.");
      setSyncSummary(data.summary);
      setDns(mapDnsCacheRow(data.settings));
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function runResolverTest() {
    if (!testHostname.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/cache/dns/resolver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", hostname: testHostname.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed.");
      setTestResult(data.result);
      setResolverStats(data.stats ?? null);
      setResolverEntries(data.entries ?? []);
    } catch (err) {
      setTestResult({
        hostname: testHostname.trim(),
        address: null,
        family: null,
        fromCache: false,
        ttlSeconds: null,
        ttlRemainingSeconds: null,
        durationMs: 0,
        error: err instanceof Error ? err.message : "Lookup failed.",
      });
    } finally {
      setTesting(false);
    }
  }

  async function clearResolver() {
    setClearing(true);
    try {
      const res = await fetch("/api/admin/cache/dns/resolver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      const data = await res.json();
      if (res.ok) {
        setResolverStats(data.stats ?? null);
        setResolverEntries(data.entries ?? []);
      }
    } finally {
      setClearing(false);
    }
  }

  if (!dns || !prefetch) {
    return (
      <div className="flex items-center justify-center py-20 text-text-faint">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  const connected = dns.apiTokenSet && Boolean(dns.zoneId);

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">DNS Cache</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Four layers between a visitor typing this site's name and a byte actually leaving Cloudflare's edge —
            each with a different owner, so each gets handled honestly rather than pretending one toggle covers all of them.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="glow-yellow-button flex shrink-0 items-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
          {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </div>

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {/* ══════════════════════ 1. Cloudflare DNS ══════════════════════ */}
      <h2 className="mb-2 mt-2 flex items-center gap-2 text-sm font-bold text-white">
        <Cloud size={15} className="text-[var(--color-menu-yellow)]" /> 1. Cloudflare DNS
      </h2>

      <Section
        title="Cloudflare connection"
        hint="This app calls Cloudflare's API on your behalf to actually apply DNSSEC and CNAME Flattening below — toggling them here does nothing on Cloudflare's side until you save and sync. Independent from the credentials on CDN / Edge Cache — paste the same Zone ID and Token here if it's the same zone."
      >
        <div className="flex items-center justify-between gap-3">
          {connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">
              <CheckCircle2 size={13} />
              {dns.connectedZoneName ? `Connected — ${dns.connectedZoneName}` : "Credentials saved"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-text-faint">
              <Cloud size={13} /> Not connected
            </span>
          )}
          {connected && (
            <button
              type="button"
              onClick={disconnect}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/15 hover:text-white"
            >
              <Unlink size={12} /> Disconnect
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/70">Zone ID</span>
            <input
              value={zoneIdDraft}
              onChange={(e) => setZoneIdDraft(e.target.value)}
              placeholder="023e105f4ecef8ad9ca31a8372d0c353"
              className="admin-input font-mono"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/70">API Token</span>
            <input
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              placeholder={dns.apiTokenPreview ? `Stored, ends in ${dns.apiTokenPreview}` : "Paste a Cloudflare API Token"}
              type="password"
              className="admin-input font-mono"
            />
          </label>
        </div>
        <p className="text-xs text-text-faint">
          Needs Zone → DNS edit and Zone Settings edit permissions for this zone. The token is stored server-side
          only and never sent back to this page — leave it blank to keep the one already saved.
        </p>
        <a
          href="https://dash.cloudflare.com/profile/api-tokens"
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1 text-xs font-semibold text-[var(--color-menu-yellow)] hover:underline"
        >
          Create an API Token <ExternalLink size={11} />
        </a>
      </Section>

      <Section title="DNSSEC" hint="Cryptographically signs DNS responses for this zone so resolvers can verify they haven't been tampered with or spoofed.">
        <ToggleField
          label="Enable DNSSEC"
          hint="Once active, add the DS record Cloudflare gives you at your registrar to complete the chain of trust — Cloudflare can't do that half for you."
          checked={dns.dnssecEnabled}
          onChange={(v) => patchDns({ dnssecEnabled: v })}
        />
      </Section>

      <Section title="CNAME Flattening" hint="Controls how far Cloudflare flattens CNAME records into A/AAAA records at the DNS layer.">
        <div className="flex flex-col gap-2">
          {CNAME_FLATTENING_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                dns.cnameFlatteningMode === opt.value ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              <input
                type="radio"
                name="cname-flattening-mode"
                className="mt-1"
                checked={dns.cnameFlatteningMode === opt.value}
                onChange={() => patchDns({ cnameFlatteningMode: opt.value })}
              />
              <span>
                <span className="block text-sm font-semibold text-white">{opt.label}</span>
                <span className="block text-xs text-text-faint">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Sync to Cloudflare</h2>
            <p className="mt-1 text-xs text-text-faint">
              Save changes first, then sync — this calls Cloudflare's API and reports exactly what happened.
            </p>
          </div>
          <button
            type="button"
            onClick={sync}
            disabled={syncing || !connected}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            {syncing ? "Syncing…" : "Sync to Cloudflare"}
          </button>
        </div>

        {!connected && <p className="text-sm text-text-faint">Connect a Zone ID and API Token above first.</p>}
        {syncError && <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{syncError}</div>}

        {syncSummary && (
          <div className="flex flex-col divide-y divide-white/5">
            <StepRow label="Zone" result={syncSummary.zone} />
            <StepRow label="DNSSEC" result={syncSummary.dnssec} />
            <StepRow label="CNAME Flattening" result={syncSummary.cnameFlattening} />
          </div>
        )}

        {dns.lastSyncedAt && (
          <p className="text-[11px] text-text-faint">
            Last synced {new Date(dns.lastSyncedAt).toLocaleString()} —{" "}
            {dns.lastSyncStatus === "success" ? "all steps succeeded" : dns.lastSyncStatus === "partial" ? "some steps failed" : "failed"}.
          </p>
        )}
      </div>

      {/* ══════════════════════ 2. Browser DNS Cache ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Network size={15} className="text-[var(--color-menu-yellow)]" /> 2. Browser DNS Cache
      </h2>

      <Section
        title="DNS Prefetch Control"
        hint="Most browsers already resolve DNS for a page's own links ahead of a click by default. This header lets you explicitly confirm — or opt a response out of — that behaviour."
      >
        <ToggleField
          label="Send X-DNS-Prefetch-Control header"
          hint="Applied by middleware on every page response. Off only makes sense for pages you deliberately don't want pre-resolving third-party hosts."
          checked={prefetch.dnsPrefetchControlEnabled}
          onChange={(v) => patchPrefetch({ dnsPrefetchControlEnabled: v })}
        />
      </Section>

      <Section
        title="DNS Prefetch domains"
        hint={'Third-party hostnames rendered as <link rel="dns-prefetch"> in the document head — resolves their DNS before the browser actually needs to connect (analytics, ads, embeds).'}
      >
        <ChipListField
          values={prefetch.dnsPrefetchDomains}
          placeholder="static.example.com"
          onAdd={(v) => patchPrefetch({ dnsPrefetchDomains: [...prefetch.dnsPrefetchDomains, v] })}
          onRemove={(v) => patchPrefetch({ dnsPrefetchDomains: prefetch.dnsPrefetchDomains.filter((d) => d !== v) })}
        />
      </Section>

      <Section
        title="Preconnect domains"
        hint='A hotter subset of the above — also opens the TCP + TLS connection ahead of time, not just DNS. More expensive per origin, so keep this list small: only hosts truly on the critical path.'
      >
        <ChipListField
          values={prefetch.preconnectDomains}
          placeholder="www.googletagmanager.com"
          onAdd={(v) => patchPrefetch({ preconnectDomains: [...prefetch.preconnectDomains, v] })}
          onRemove={(v) => patchPrefetch({ preconnectDomains: prefetch.preconnectDomains.filter((d) => d !== v) })}
        />
        <CodeBlock
          label="Renders as"
          code={[
            ...prefetch.preconnectDomains.map((d) => `<link rel="preconnect" href="https://${d}" crossorigin>`),
            ...prefetch.dnsPrefetchDomains
              .filter((d) => !prefetch.preconnectDomains.includes(d))
              .map((d) => `<link rel="dns-prefetch" href="//${d}">`),
          ].join("\n") || "No hints configured."}
        />
      </Section>

      {/* ══════════════════════ 3. Operating System DNS Cache ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Terminal size={15} className="text-[var(--color-menu-yellow)]" /> 3. Operating System DNS Cache
      </h2>

      <Section
        title="Nothing here is enforceable from this app"
        hint="A visitor's operating system keeps its own DNS resolver cache (Windows' DNS Client service, macOS's mDNSResponder, systemd-resolved on Linux). No response header or server-side setting can flush, configure, or even see it — that cache lives entirely on their machine. What's below is reference material for support/ops, not a live control."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {OS_FLUSH_COMMANDS.map((c) => (
            <CodeBlock key={c.os} label={c.os} code={c.command} />
          ))}
        </div>
      </Section>

      <Section
        title="Runbook notes"
        hint="Persisted, editable guidance for whoever's on call — e.g. when to actually tell a user to flush their OS cache (after a real nameserver/record migration), and when not to bother (most of the time)."
      >
        <textarea
          value={dns.osDnsRunbookNotes}
          onChange={(e) => patchDns({ osDnsRunbookNotes: e.target.value })}
          rows={4}
          maxLength={4000}
          className="admin-input resize-y font-mono text-xs"
        />
      </Section>

      {/* ══════════════════════ 4. Resolver Cache ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <ShieldCheck size={15} className="text-[var(--color-menu-yellow)]" /> 4. Resolver Cache
      </h2>

      <Section
        title="This server's own outbound resolver cache"
        hint="A real, in-memory TTL cache (per running server instance) for DNS lookups this app's own server makes — calling Supabase, the Cloudflare API, or checking an embedded game's origin. Honors the real DNS TTL, clamped to the range below. Resets on redeploy or a cold start, same as this app's other in-process caches."
      >
        <ToggleField
          label="Enable resolver cache"
          checked={dns.resolverCacheEnabled}
          onChange={(v) => patchDns({ resolverCacheEnabled: v })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/70">Min TTL (seconds)</span>
            <input
              type="number"
              min={5}
              max={3600}
              value={dns.resolverCacheMinTtlSeconds}
              onChange={(e) => patchDns({ resolverCacheMinTtlSeconds: Math.min(3600, Math.max(5, Number(e.target.value) || 5)) })}
              className="admin-input"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/70">Max TTL (seconds)</span>
            <input
              type="number"
              min={60}
              max={86400}
              value={dns.resolverCacheMaxTtlSeconds}
              onChange={(e) => patchDns({ resolverCacheMaxTtlSeconds: Math.min(86400, Math.max(60, Number(e.target.value) || 60)) })}
              className="admin-input"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/70">Max entries</span>
            <input
              type="number"
              min={10}
              max={5000}
              value={dns.resolverCacheMaxEntries}
              onChange={(e) => patchDns({ resolverCacheMaxEntries: Math.min(5000, Math.max(10, Number(e.target.value) || 10)) })}
              className="admin-input"
            />
          </label>
        </div>
      </Section>

      <Section title="Test a hostname" hint="Resolves through the live cache — run it twice in a row to see a miss followed by a hit.">
        <div className="flex gap-2">
          <input
            value={testHostname}
            onChange={(e) => setTestHostname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runResolverTest()}
            placeholder="api.cloudflare.com"
            className="admin-input flex-1 font-mono"
          />
          <button
            type="button"
            onClick={runResolverTest}
            disabled={testing || !testHostname.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {testing ? "Resolving…" : "Resolve"}
          </button>
        </div>

        {testResult && (
          <div className="glass rounded-xl p-4 text-sm">
            {testResult.error ? (
              <p className="text-hot">{testResult.error}</p>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      testResult.fromCache ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {testResult.fromCache ? "Cache hit" : "Fresh lookup"}
                  </span>
                  <code className="text-xs text-white/80">{testResult.hostname}</code>
                </div>
                <p className="text-xs text-text-faint">
                  Resolved to <code className="text-white/80">{testResult.address}</code> (A/AAAA family {testResult.family}) in{" "}
                  {testResult.durationMs}ms
                  {testResult.ttlSeconds !== null && <> — TTL {testResult.ttlSeconds}s</>}
                  {testResult.ttlRemainingSeconds !== null && testResult.fromCache && (
                    <> ({testResult.ttlRemainingSeconds}s remaining)</>
                  )}
                  .
                </p>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Cache status">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="glass flex flex-col gap-1 rounded-xl px-4 py-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">Entries</span>
            <span className="text-sm font-bold text-white">{resolverStats?.size ?? 0}</span>
          </div>
          <div className="glass flex flex-col gap-1 rounded-xl px-4 py-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">Hits</span>
            <span className="text-sm font-bold text-white">{resolverStats?.hits ?? 0}</span>
          </div>
          <div className="glass flex flex-col gap-1 rounded-xl px-4 py-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">Misses</span>
            <span className="text-sm font-bold text-white">{resolverStats?.misses ?? 0}</span>
          </div>
          <div className="glass flex flex-col gap-1 rounded-xl px-4 py-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">Hit rate</span>
            <span className="text-sm font-bold text-white">{Math.round((resolverStats?.hitRate ?? 0) * 100)}%</span>
          </div>
        </div>

        {resolverEntries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-text-faint">
                  <th className="px-2 py-1.5 font-semibold">Hostname</th>
                  <th className="px-2 py-1.5 font-semibold">Address</th>
                  <th className="px-2 py-1.5 font-semibold">TTL remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {resolverEntries.map((e) => (
                  <tr key={e.hostname}>
                    <td className="px-2 py-1.5 font-mono text-white/80">{e.hostname}</td>
                    <td className="px-2 py-1.5 font-mono text-white/60">{e.address}</td>
                    <td className="px-2 py-1.5 text-white/60">{e.ttlRemainingSeconds}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="button"
          onClick={clearResolver}
          disabled={clearing}
          className="flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
        >
          {clearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          {clearing ? "Clearing…" : "Clear resolver cache"}
        </button>
        {dns.resolverCacheLastClearedAt && (
          <p className="text-[11px] text-text-faint">Last cleared {new Date(dns.resolverCacheLastClearedAt).toLocaleString()}.</p>
        )}
      </Section>
    </div>
  );
}
