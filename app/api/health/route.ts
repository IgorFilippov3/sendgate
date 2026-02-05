import { NextResponse } from "next/server";
import { CONFIG } from "@/lib/engine/config";

export async function GET() {
  return NextResponse.json(
    {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: CONFIG.appVersion,
      uptime: process.uptime(),
      env: process.env.NODE_ENV,
    },
    {
      status: 200,
    },
  );
}
