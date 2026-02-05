"use server";

import { analyzeSingleEmail, analyzeEmailList } from "./analysis-engine";
import { CONFIG } from "./engine/config";

/**
 * Server Action: Performs risk analysis for a single email address.
 * 
 * @param email - The raw email address to analyze.
 * @returns Object indicating success/failure and the analysis data or error message.
 */
export async function actionAnalyzeSingle(email: string) {
  try {
    const result = await analyzeSingleEmail(email);
    return { success: true, data: result };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze email";
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Server Action: Performs batch risk analysis for a list of email addresses.
 * 
 * Validates the batch size against CONFIG.maxBulkEmails before processing.
 * 
 * @param emails - Array of raw email strings.
 * @returns Object indicating success/failure and the analysis summary or error message.
 */
export async function actionAnalyzeBatch(emails: string[]) {
  try {
    const limit = CONFIG.maxBulkEmails;

    if (limit && emails.length > limit) {
      return {
        success: false,
        error: `Batch size exceeded. Max allowed is ${limit} emails per analysis.`,
      };
    }

    const summary = await analyzeEmailList(emails);
    return { success: true, data: summary };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze list";
    return {
      success: false,
      error: message,
    };
  }
}
