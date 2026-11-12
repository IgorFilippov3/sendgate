import { NextResponse } from "next/server";
import { engine } from "@/lib/engine";
import { CONFIG } from "@/lib/engine/config";
import { apiError, handleApi } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleApi(request, async (body) => {
    const { emails, sandbox } = body;
    if (!Array.isArray(emails) || emails.length === 0 || !emails.every((e) => typeof e === "string")) {
      return apiError(400, "invalid_emails", "Expected a non-empty 'emails' array of strings.");
    }
    if (emails.length > CONFIG.maxBulkEmails) {
      return apiError(
        413,
        "batch_too_large",
        `A batch may contain at most ${CONFIG.maxBulkEmails} emails (MAX_BULK_EMAILS).`,
      );
    }
    const { verifier, sandbox: sandboxVerifier } = engine();
    const result = await (sandbox === true ? sandboxVerifier : verifier).verifyMany(
      (emails as string[]).map((e) => e.slice(0, 512)),
    );
    return NextResponse.json({ ...result, sandbox: sandbox === true });
  });
}
