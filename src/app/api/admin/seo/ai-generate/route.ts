import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { aiSeoGenerateSchema, firstIssueMessage } from "@/lib/validation";

// POST /api/admin/seo/ai-generate — the AI SEO Assistant. Admin only.
// Given a game/category/post's title (+ optional description/category),
// asks Claude to draft the requested SEO fields and returns them as plain
// data — nothing is saved here, the admin form applies (or discards) the
// suggestion itself. Requires ANTHROPIC_API_KEY to be set in the
// deployment's environment; returns a clear, actionable error if it isn't
// rather than a raw fetch failure.

const FIELD_DESCRIPTIONS: Record<string, string> = {
  seo_title: "an SEO title, 50-60 characters, compelling and keyword-forward",
  meta_description: "a meta description, 140-160 characters, action-oriented, ending with an implicit call to play/read",
  focus_keyword: "a single primary focus keyword phrase (2-5 words) this page should rank for",
  secondary_keywords: "an array of 3-6 related secondary keyword phrases",
  seo_excerpt: "a 1-2 sentence excerpt/summary, up to 200 characters",
  og_title: "an Open Graph title optimized for social sharing, under 95 characters",
  og_description: "an Open Graph description optimized for social sharing, under 200 characters",
  twitter_title: "a Twitter/X card title, under 70 characters",
  twitter_description: "a Twitter/X card description, under 200 characters",
};

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI SEO Assistant isn't configured yet — set ANTHROPIC_API_KEY in the deployment environment." },
      { status: 501 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = aiSeoGenerateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { itemType, title, description, category, fields } = parsed.data;

  const fieldList = fields.map((f) => `- "${f}": ${FIELD_DESCRIPTIONS[f]}`).join("\n");
  const prompt = `You are an SEO specialist writing metadata for a free online games website (MofiGames).

Item type: ${itemType}
Title: ${title}
${category ? `Category: ${category}\n` : ""}${description ? `Description: ${description}\n` : ""}
Write the following fields:
${fieldList}

Respond with ONLY a single JSON object mapping each requested field name to its value (strings, except secondary_keywords which is a string array). No markdown, no code fences, no commentary — just the raw JSON object.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "The AI SEO Assistant is temporarily unavailable." }, { status: 502 });
    }

    const data = await response.json();
    const text = (data.content ?? [])
      .map((block: { type: string; text?: string }) => (block.type === "text" ? block.text ?? "" : ""))
      .join("");

    const cleaned = text.replace(/```json|```/g, "").trim();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "The AI SEO Assistant returned an unexpected response — try again." }, { status: 502 });
    }

    // Only return the fields that were actually requested, and only if
    // they're the expected shape — never trust the model's output blindly
    // into the admin form.
    const filtered: Record<string, string | string[]> = {};
    for (const field of fields) {
      const value = result[field];
      if (field === "secondary_keywords") {
        if (Array.isArray(value)) filtered[field] = value.filter((v): v is string => typeof v === "string");
      } else if (typeof value === "string") {
        filtered[field] = value;
      }
    }

    return NextResponse.json({ result: filtered });
  } catch {
    return NextResponse.json({ error: "The AI SEO Assistant is temporarily unavailable." }, { status: 502 });
  }
}
