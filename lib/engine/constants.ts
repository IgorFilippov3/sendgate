import { CONFIG } from "./config";

/** Maximum number of emails processed in a single batch. */
export const MAX_EMAILS_PER_ANALYSIS = CONFIG.maxBulkEmails;
/** Maximum allowed file size for CSV uploads in MB. */
export const MAX_FILE_SIZE_MB = CONFIG.maxFileSizeMb;
