import { logger } from "../utils/logger.js";

export interface AuditEntry {
  tool: string;
  params: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  error?: string;
}

export function auditToolCall(entry: AuditEntry): void {
  logger.info(`tool:${entry.tool}`, {
    params: redactSensitiveParams(entry.params),
    durationMs: entry.durationMs,
    success: entry.success,
    ...(entry.error ? { error: entry.error } : {}),
  });
}

const SENSITIVE_KEYS = ["token", "secret", "password", "webhook_url"];

function redactSensitiveParams(params: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk))) {
      redacted[key] = "[REDACTED]";
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // Recurse into nested objects so nested sensitive fields are also redacted (M-4)
      redacted[key] = redactSensitiveParams(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
