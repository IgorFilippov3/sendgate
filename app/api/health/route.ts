import { NextResponse } from "next/server";
import { CONFIG } from "@/lib/engine/config";
import { engine } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const { verifier, disposable } = engine();
  return NextResponse.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: CONFIG.appVersion,
    uptime: process.uptime(),
    env: process.env.NODE_ENV,
    capabilities: {
      smtp: verifier.smtpSnapshot(),
      disposableDomains: disposable.size,
      api: !!CONFIG.apiKey,
      maxBulkEmails: CONFIG.maxBulkEmails,
    },
  });
}
