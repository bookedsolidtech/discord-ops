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

function redactSensitiveParams(params: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...params };
  const sensitiveKeys = ["token", "secret", "password", "webhook_url"];

  for (const key of Object.keys(redacted)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
      redacted[key] = "[REDACTED]";
    } else if (Array.isArray(redacted[key])) {
      redacted[key] = (redacted[key] as unknown[]).map((element) =>
        element !== null && typeof element === "object" && !Array.isArray(element)
          ? redactSensitiveParams(element as Record<string, unknown>)
          : Array.isArray(element)
            ? redactSensitiveParams({ __arr: element }).__arr
            : element,
      );
    } else if (redacted[key] !== null && typeof redacted[key] === "object") {
      redacted[key] = redactSensitiveParams(redacted[key] as Record<string, unknown>);
    }
  }

  return redacted;
}
