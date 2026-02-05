import { NextResponse } from "next/server";
import { analyzeSingleEmail } from "@/lib/analysis-engine";
import { CONFIG } from "@/lib/engine/config";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const REQUIRED_API_KEY = CONFIG.apiKey;

    if (!REQUIRED_API_KEY) {
      return NextResponse.json(
        {
          error: "API access is disabled on this public demo.",
          message:
            "To use the API in your projects, please deploy your own SendGate instance.",
        },
        { status: 403 },
      );
    }

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ") ||
      authHeader.substring(7) !== REQUIRED_API_KEY
    ) {
      return NextResponse.json(
        { error: "Invalid or missing API key." },
        { status: 401 },
      );
    }

    const { email, sandbox } = await request.json();
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Invalid input. Expected a JSON body with an 'email' field." },
        { status: 400 },
      );
    }

    if (sandbox === true) {
      let mockRisk: "safe" | "risky" | "dangerous" = "safe";
      let mockScore = 100;
      let mockFindings = [
        "Verified provider configuration",
        "Standard shared infrastructure",
      ];

      if (email.startsWith("risky@")) {
        mockRisk = "risky";
        mockScore = 65;
        mockFindings = [
          "Warning: Catch-all configuration",
          "Standard shared infrastructure",
        ];
      } else if (email.startsWith("dangerous@")) {
        mockRisk = "dangerous";
        mockScore = 30;
        mockFindings = [
          "Critical: Listed on major blocklists",
          "Critical: No SPF identity found",
        ];
      }

      return NextResponse.json({
        email,
        risk: mockRisk,
        score: mockScore,
        details: {
          is_disposable: mockRisk === "dangerous",
          is_role_based: mockRisk === "risky",
          is_typo: false,
          is_catch_all: mockRisk === "risky",
          has_mx: mockRisk !== "dangerous",
          has_spf: mockRisk === "safe",
          has_dmarc: mockRisk === "safe",
        },
        findings: mockFindings,
        sandbox: true,
      });
    }

    const result = await analyzeSingleEmail(email);

    return NextResponse.json({
      email: result.email,
      risk: result.risk,
      score: result.analysis.score,
      details: {
        is_disposable:
          result.analysis.categories.behavioral.score === 0 &&
          result.analysis.categories.behavioral.findings.some((f) =>
            f.toLowerCase().includes("disposable"),
          ),
        is_role_based: result.analysis.categories.behavioral.findings.some(
          (f) => f.toLowerCase().includes("role-based"),
        ),
        is_typo: result.analysis.categories.behavioral.findings.some((f) =>
          f.toLowerCase().includes("typo"),
        ),
        is_catch_all: result.analysis.categories.behavioral.findings.some((f) =>
          f.toLowerCase().includes("catch-all"),
        ),
        has_mx: result.analysis.categories.infrastructure.score > 0,
        has_spf: !result.analysis.categories.auth.findings.some((f) =>
          f.toLowerCase().includes("no spf"),
        ),
        has_dmarc: !result.analysis.categories.auth.findings.some((f) =>
          f.toLowerCase().includes("no dmarc"),
        ),
      },
      findings: [
        ...result.analysis.categories.auth.findings,
        ...result.analysis.categories.infrastructure.findings,
        ...result.analysis.categories.reputation.findings,
        ...result.analysis.categories.behavioral.findings,
      ],
    });
  } catch (error) {
    console.error("API Analyze Error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
