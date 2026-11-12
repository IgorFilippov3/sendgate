import { NextResponse } from "next/server";
import { engine } from "@/lib/engine";
import { apiError, handleApi } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleApi(request, async (body) => {
    const { email, sandbox } = body;
    if (typeof email !== "string" || !email.trim()) {
      return apiError(400, "invalid_email", "Expected a non-empty 'email' string.");
    }
    if (email.length > 512) {
      return apiError(400, "invalid_email", "'email' is too long.");
    }
    const { verifier, sandbox: sandboxVerifier } = engine();
    const result = await (sandbox === true ? sandboxVerifier : verifier).verifyEmail(email);
    return NextResponse.json({ ...result, sandbox: sandbox === true });
  });
}
