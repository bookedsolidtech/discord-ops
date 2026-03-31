/**
 * Validates Discord bot token format without making API calls.
 * Tokens follow the pattern: base64(bot_id).timestamp.hmac
 */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}$/;

export function validateTokenFormat(token: string): { valid: boolean; reason?: string } {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "Token is empty or not a string" };
  }

  if (token.length < 50) {
    return { valid: false, reason: "Token is too short" };
  }

  if (!TOKEN_PATTERN.test(token)) {
    return { valid: false, reason: "Token does not match expected format (base64.timestamp.hmac)" };
  }

  return { valid: true };
}
