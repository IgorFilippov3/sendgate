"use server";

import { headers } from "next/headers";
import { engine } from "./engine";
import { CONFIG } from "./engine/config";
import type { BatchResult, EmailVerification } from "./engine/types";
import { clientKey, rateLimit } from "./server/guard";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

async function guard(): Promise<string | null> {
  const wait = rateLimit(`web:${clientKey(await headers())}`);
  return wait > 0 ? `Too many requests. Please wait ${wait}s and try again.` : null;
}

/** Server Action: verifies a single address for the web UI. */
export async function actionVerifySingle(email: string): Promise<ActionResult<EmailVerification>> {
  const limited = await guard();
  if (limited) return { success: false, error: limited };
  if (typeof email !== "string" || !email.trim() || email.length > 512) {
    return { success: false, error: "Please enter an email address." };
  }
  try {
    return { success: true, data: await engine().verifier.verifyEmail(email) };
  } catch (err) {
    console.error("[action] verify failed", err);
    return { success: false, error: "Verification failed. Please try again." };
  }
}

/** Server Action: verifies a list of addresses for the web UI. */
export async function actionVerifyBatch(emails: string[]): Promise<ActionResult<BatchResult>> {
  const limited = await guard();
  if (limited) return { success: false, error: limited };
  if (!Array.isArray(emails) || emails.length === 0) {
    return { success: false, error: "No emails found in the file." };
  }
  if (emails.length > CONFIG.maxBulkEmails) {
    return {
      success: false,
      error: `This instance accepts at most ${CONFIG.maxBulkEmails} emails per list.`,
    };
  }
  try {
    const input = emails.filter((e) => typeof e === "string").map((e) => e.slice(0, 512));
    return { success: true, data: await engine().verifier.verifyMany(input) };
  } catch (err) {
    console.error("[action] batch failed", err);
    return { success: false, error: "Verification failed. Please try again." };
  }
}

/** Limits shown in the UI. */
export async function actionLimits() {
  return { maxBulkEmails: CONFIG.maxBulkEmails, maxFileSizeMb: CONFIG.maxFileSizeMb };
}
