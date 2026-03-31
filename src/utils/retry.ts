import { logger } from "./logger.js";

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

const DEFAULTS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  opts?: RetryOptions,
): Promise<T> {
  const { maxRetries, baseDelay, maxDelay } = { ...DEFAULTS, ...opts };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;

      const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
      const jitter = delay * (0.5 + Math.random() * 0.5);

      logger.warn(`Retry ${attempt + 1}/${maxRetries} for ${label}`, {
        delay: Math.round(jitter),
        error: err instanceof Error ? err.message : String(err),
      });

      await new Promise((r) => setTimeout(r, jitter));
    }
  }

  throw new Error("Unreachable");
}
