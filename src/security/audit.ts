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
    } else if (Array.isArray(value)) {
      redacted[key] = (value as unknown[]).map((element) =>
        element !== null && typeof element === "object" && !Array.isArray(element)
          ? redactSensitiveParams(element as Record<string, unknown>)
          : Array.isArray(element)
            ? redactSensitiveParams({ __arr: element }).__arr
            : element,
      );
    } else if (value !== null && typeof value === "object") {
      redacted[key] = redactSensitiveParams(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
