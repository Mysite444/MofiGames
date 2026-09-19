import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { compressionTestInputSchema, firstIssueMessage } from "@/lib/validation-compression-cache";
import type { CompressionEncoding, CompressionTestProbe } from "@/lib/compression-cache-settings";

const PROBES: { encoding: CompressionEncoding; acceptEncoding: string }[] = [
  { encoding: "br", acceptEncoding: "br" },
  { encoding: "gzip", acceptEncoding: "gzip" },
  { encoding: "identity", acceptEncoding: "identity" },
];

/** Requests `url` with a single, deliberately narrow Accept-Encoding value
 * and reports what actually came back — the only reliable way to know
 * whether a given front (Vercel's edge, Nginx, whatever's in front of
 * this app) is honouring negotiation, short of reading its config. */
async function probe(url: string, acceptEncoding: string, encoding: CompressionEncoding): Promise<CompressionTestProbe> {
  try {
    const res = await fetch(url, {
      headers: { "Accept-Encoding": acceptEncoding, "User-Agent": "Mofigames-Admin-Compression-Test/1.0" },
      cache: "no-store",
      redirect: "follow",
    });
    const contentEncodingReceived = res.headers.get("content-encoding");
    const contentLengthHeader = res.headers.get("content-length");
    const transferredBytes = contentLengthHeader ? Number(contentLengthHeader) : null;
    const buf = await res.arrayBuffer();
    const decodedBytes = buf.byteLength;
    const ratio =
      transferredBytes !== null && decodedBytes > 0
        ? Math.round((transferredBytes / decodedBytes) * 1000) / 1000
        : null;

    if (!res.ok) {
      return {
        encoding,
        contentEncodingReceived,
        transferredBytes,
        decodedBytes,
        ratio,
        ok: false,
        message: `Server responded ${res.status} ${res.statusText}.`,
      };
    }

    if (encoding === "identity") {
      return {
        encoding,
        contentEncodingReceived,
        transferredBytes,
        decodedBytes,
        ratio,
        ok: true,
        message: contentEncodingReceived
          ? `Server sent Content-Encoding: ${contentEncodingReceived} even though "identity" was requested — some fronts always compress compressible types.`
          : "No compression, as expected — identity was requested.",
      };
    }

    const negotiated = contentEncodingReceived?.toLowerCase() === encoding;
    let message: string;
    if (negotiated && ratio !== null) {
      message = `Negotiated ${encoding} — ${transferredBytes} bytes on the wire for ${decodedBytes} decoded (${Math.round((1 - ratio) * 100)}% smaller).`;
    } else if (negotiated) {
      message = `Negotiated ${encoding} — response used chunked transfer, so on-wire size wasn't reported.`;
    } else if (contentEncodingReceived) {
      message = `Requested ${encoding} but the server sent Content-Encoding: ${contentEncodingReceived} instead.`;
    } else {
      message = `Requested ${encoding} but the server sent no Content-Encoding at all — this front doesn't compress this response, or it's under the minimum-size floor.`;
    }

    return { encoding, contentEncodingReceived, transferredBytes, decodedBytes, ratio, ok: negotiated, message };
  } catch (err) {
    return {
      encoding,
      contentEncodingReceived: null,
      transferredBytes: null,
      decodedBytes: null,
      ratio: null,
      ok: false,
      message: err instanceof Error ? err.message : "Request failed.",
    };
  }
}

/** POST /api/admin/cache/compression/test — Admin → Cache → Compression →
 * "Test Compression". Admin-only. Makes three real requests to a
 * site-relative path on this app, one each for Accept-Encoding: br,
 * gzip, and identity, and records what actually came back. Unlike most
 * of the other Cache sections' settings (which are declarative config
 * for infrastructure this app doesn't itself run), this test is
 * genuinely live — it's checking real behaviour of whatever's in front
 * of this deployment right now. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = compressionTestInputSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const path = parsed.data.path || "/";
  const url = `${req.nextUrl.origin}${path}`;

  const results = await Promise.all(PROBES.map((p) => probe(url, p.acceptEncoding, p.encoding)));
  const ok = results.every((r) => r.ok);
  const now = new Date().toISOString();
  const message = ok
    ? "All probed encodings behaved as expected."
    : `${results.filter((r) => !r.ok).length} of ${results.length} probes didn't get the encoding they asked for — see details below.`;

  const { data, error } = await supabase
    .from("compression_cache_settings")
    .update({
      last_tested_at: now,
      last_test_status: ok ? "success" : "failed",
      last_test_message: message,
      last_test_result: results,
      updated_by: user.id,
    })
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { result: { ok, message, probes: results }, settings: null, warning: "Test ran but failed to persist the result." },
      { status: 207 },
    );
  }

  return NextResponse.json({ result: { ok, message, probes: results }, settings: data });
}
