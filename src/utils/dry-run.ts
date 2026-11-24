import { toolResultJson, type ToolContext, type ToolDefinition } from "../tools/types.js";
import type { ToolResult } from "../tools/types.js";

/** Dry-run is on when the caller asks for it or either environment variable is set. */
export function isDryRunEnabled(requested?: boolean): boolean {
  return !!(requested || process.env.DISCORD_OPS_DRY_RUN || process.env.DRY_RUN);
}

/**
 * What a destructive tool returns in dry-run mode: the refusal its read-only
 * preflight gives, else a simulated result. `handle` is never called.
 */
export async function dryRunResult(
  tool: ToolDefinition,
  params: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const refusal = await tool.preflight?.(params, ctx);
  if (refusal) return refusal;
  return toolResultJson({
    dryRun: true,
    tool: tool.name,
    action: "simulated",
    params,
    message: `[DRY RUN] Would execute ${tool.name} — no changes made`,
  });
}
