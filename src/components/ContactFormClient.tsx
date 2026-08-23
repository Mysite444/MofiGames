"use client";

import { useState, type FormEvent } from "react";
import { Send, Loader2, CheckCircle2, User, Mail, FileText, MessageSquare } from "lucide-react";

const inputWrap =
  "glass flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 transition-all focus-within:ring-2 focus-within:ring-white/40";
const inputBase =
  "w-full bg-transparent text-sm text-white placeholder:text-text-faint focus:outline-none";

interface Field {
  id: string;
  label: string;
  placeholder: string;
}

const SUBJECTS: Field[] = [
  { id: "bug", label: "Bug report", placeholder: "Bug report" },
  { id: "feedback", label: "Feedback", placeholder: "Feedback" },
  { id: "copyright", label: "Copyright claim", placeholder: "Copyright claim" },
  { id: "business", label: "Business enquiry", placeholder: "Business enquiry" },
  { id: "other", label: "Other", placeholder: "Other" },
];

/**
 * ContactFormClient — rendered by /contact/page.tsx below the CMS content.
 *
 * Validation mirrors the server-side contactFormSchema in lib/validation.ts:
 *  • Name ≥ 2 chars, ≤ 120
 *  • Valid email, ≤ 255
 *  • Subject ≥ 3 chars, ≤ 200
 *  • Message ≥ 10 chars, ≤ 5000
 *
 * A hidden honeypot field (`website`) is included — real visitors never see
 * or fill it; bots that blindly fill all fields are caught server-side.
 */
export function ContactFormClient() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [customSubject, setCustomSubject] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot — off-screen, hidden from assistive tech, named to tempt bots
  const [website, setWebsite] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  function clientValidate(): string | null {
    if (name.trim().length < 2) return "Please enter your name (at least 2 characters).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "Enter a valid email address.";
    const resolvedSubject = subject === "other" ? customSubject.trim() : subject.trim();
    if (resolvedSubject.length < 3) return "Please choose or enter a subject.";
    if (message.trim().length < 10)
      return "Message must be at least 10 characters.";
    if (message.trim().length > 5000)
      return "Message is too long (max 5000 characters).";
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const clientError = clientValidate();
    if (clientError) {
      setError(clientError);
      return;
    }

    const resolvedSubject =
      subject === "other" ? customSubject.trim() : subject.trim();

    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          subject: resolvedSubject,
          message: message.trim(),
          website, // honeypot — blank for real users
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="glass-strong mt-8 flex flex-col items-center gap-4 rounded-2xl p-8 text-center">
        <CheckCircle2 size={40} className="text-emerald-400" />
        <div>
          <p className="text-base font-semibold text-white">Message sent!</p>
          <p className="mt-1 text-sm text-text-faint">
            We typically reply within 1–2 business days.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="glass-strong mt-8 flex flex-col gap-4 rounded-2xl p-6 sm:p-7"
    >
      {/* Honeypot — completely hidden from real users */}
      <div
        aria-hidden="true"
        className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden"
      >
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

      <h2 className="text-base font-bold text-white">Send us a message</h2>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot"
        >
          {error}
        </p>
      )}

      {/* Name */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-text-muted">Your name</span>
        <div className={inputWrap}>
          <User size={16} className="mt-0.5 shrink-0 text-text-faint" />
          <input
            type="text"
            autoComplete="name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Player"
            className={inputBase}
          />
        </div>
      </label>

      {/* Email */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-text-muted">Email address</span>
        <div className={inputWrap}>
          <Mail size={16} className="mt-0.5 shrink-0 text-text-faint" />
          <input
            type="email"
            autoComplete="email"
            required
            maxLength={255}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputBase}
          />
        </div>
      </label>

      {/* Subject */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-text-muted">Subject</span>
        <div className={inputWrap}>
          <FileText size={16} className="mt-0.5 shrink-0 text-text-faint" />
          <select
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={`${inputBase} cursor-pointer`}
          >
            <option value="" disabled>
              Choose a topic…
            </option>
            {SUBJECTS.map((s) => (
              <option key={s.id} value={s.id} className="bg-[#1a1a2e] text-white">
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {subject === "other" && (
          <div className={inputWrap}>
            <input
              type="text"
              maxLength={200}
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              placeholder="Describe your topic…"
              className={inputBase}
            />
          </div>
        )}
      </div>

      {/* Message */}
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-xs font-semibold text-text-muted">
          Message
          <span className={message.length > 4500 ? "text-hot/80" : "text-text-faint"}>
            {message.length}/5000
          </span>
        </span>
        <div className={`${inputWrap} items-start`}>
          <MessageSquare size={16} className="mt-0.5 shrink-0 text-text-faint" />
          <textarea
            required
            rows={5}
            maxLength={5000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what's on your mind…"
            className={`${inputBase} resize-none`}
          />
        </div>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="glow-yellow-button mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-6 py-3 text-sm font-bold text-white transition-opacity active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Send size={16} />
        )}
        {loading ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}
