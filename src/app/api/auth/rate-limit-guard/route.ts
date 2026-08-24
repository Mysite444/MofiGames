import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { publicClient } from "@/lib/supabase/route-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

const bodySchema = z.object({
  action: z.enum(["signup", "forgot-password"]),
  email: z.string().trim().email().max(255).optional(),
});

// Deliberately generous — this exists to stop scripted abuse (mass
// account creation, email-bombing the reset endpoint), not to get in a
// real person's way.
const LIMITS: Record<
  "signup" | "forgot-password",
  { ipWindowSeconds: number; ipMax: number; emailWindowSeconds?: number; emailMax?: number }
> = {
  signup: { ipWindowSeconds: 3600, ipMax: 10 },
  "forgot-password": { ipWindowSeconds: 3600, ipMax: 10, emailWindowSeconds: 3600, emailMax: 3 },
};

/** POST /api/auth/rate-limit-guard — checked client-side before signup
 * and before requesting a password reset email, both of which call
 * Supabase Auth directly from the browser and have no other natural
 * place to enforce a limit. IP-based always; also per-email for
 * forgot-password, since that's the one that sends mail. */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ allowed: true });
  }
  const { action, email } = parsed.data;
  const limits = LIMITS[action];

  const supabase = await publicClient();
  const ip = clientIp(request);

  if (ip) {
    const underIpLimit = await checkRateLimit(supabase, `${action}-ip:${ip}`, limits.ipWindowSeconds, limits.ipMax);
    if (!underIpLimit) {
      return NextResponse.json({ allowed: false });
    }
  }

  if (email && limits.emailWindowSeconds && limits.emailMax) {
    const underEmailLimit = await checkRateLimit(
      supabase,
      `${action}-email:${email.toLowerCase()}`,
      limits.emailWindowSeconds,
      limits.emailMax
    );
    if (!underEmailLimit) {
      return NextResponse.json({ allowed: false });
    }
  }

  return NextResponse.json({ allowed: true });
}
