import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { previewSessionEncryption } from "@/lib/session-cache-client";
import { sessionEncryptionPreviewInputSchema, firstIssueMessage } from "@/lib/validation-session-cache";
import type { EncryptionAlgorithm } from "@/lib/session-cache-settings";

interface RawRow {
  encryption_algorithm: EncryptionAlgorithm;
  session_secret: string | null;
}

/** POST /api/admin/cache/session/encryption-preview — Admin → Cache →
 * Session Cache → Secure Session Storage → "Preview Encryption".
 * Admin-only. Encrypts a short sample string with the configured (or a
 * proposed, not-yet-saved) algorithm + secret and immediately decrypts
 * it back, so an admin can confirm a secret actually works before
 * relying on it — nothing here touches session_store. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = sessionEncryptionPreviewInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const input = parsed.data;

  let secret = input.secret;
  let algorithm = input.algorithm;

  if (!secret || !algorithm) {
    const { data, error } = await supabase
      .from("session_cache_settings")
      .select("encryption_algorithm, session_secret")
      .eq("id", true)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: "Failed to load session cache settings." }, { status: 500 });
    }
    const row = data as unknown as RawRow | null;
    if (!secret) secret = row?.session_secret ?? undefined;
    if (!algorithm) algorithm = row?.encryption_algorithm ?? "aes-256-gcm";
  }

  if (!secret) {
    return NextResponse.json(
      { error: "No session secret is set yet — enter one above (or pass one in to preview it before saving)." },
      { status: 422 }
    );
  }

  try {
    const preview = previewSessionEncryption(algorithm, secret, input.sample ?? "sample-session-payload");
    return NextResponse.json({ result: { ok: preview.decryptedMatches, ...preview } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Encryption preview failed." },
      { status: 500 }
    );
  }
}
