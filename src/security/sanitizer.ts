/**
 * Sanitizes error messages to prevent leaking sensitive Discord data.
 */

const SNOWFLAKE_IN_URL = /\/\d{17,20}/g;
const TOKEN_FRAGMENT = /[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g;
const WEBHOOK_URL = /https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g;

export function sanitizeError(error: unknown): string {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else {
    message = "An unknown error occurred";
  }

  // Strip tokens first (most sensitive)
  message = message.replace(TOKEN_FRAGMENT, "[REDACTED_TOKEN]");

  // Strip webhook URLs
  message = message.replace(WEBHOOK_URL, "[REDACTED_WEBHOOK_URL]");

  // Strip snowflake IDs from URLs (keep standalone IDs — they're needed for debugging)
  message = message.replace(SNOWFLAKE_IN_URL, "/[REDACTED_ID]");

  return message;
}
