import { loadConfig } from "../config/index.js";
import { profileGateError } from "../config/tool-gate.js";
import { dryRunResult, isDryRunEnabled } from "../utils/dry-run.js";
import { DiscordClient } from "../client.js";
import { allTools } from "../tools/index.js";
import { directPostGateError } from "../config/direct-post-gate.js";
import { denyToolsGateError, unsupportedDenyToolsError } from "../config/deny-tools-gate.js";

export async function runTool(
  toolName: string,
  rawArgs: string,
  options: { dryRun?: boolean } = {},
): Promise<void> {
  // Find tool
  const tool = allTools.find((t) => t.name === toolName);
  if (!tool) {
    const names = allTools.map((t) => t.name).join(", ");
    console.error(`Unknown tool: "${toolName}"\nAvailable tools: ${names}`);
    process.exit(1);
  }

  // Parse input JSON
  let rawInput: unknown;
  try {
    rawInput = JSON.parse(rawArgs);
  } catch {
    console.error(`Invalid JSON in --args:\n${rawArgs}`);
    process.exit(1);
  }

  // Validate with tool schema
  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    console.error(`Invalid args for tool "${toolName}":`);
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  // Build context
  const config = loadConfig();
  const unsupported = unsupportedDenyToolsError(config.global.projects);
  if (unsupported) {
    console.error(unsupported);
    process.exit(1);
  }
  const discord = new DiscordClient(config.defaultToken);

  try {
    // Same deny_tools gate the MCP server applies.
    const denied = await denyToolsGateError(toolName, parsed.data, { discord, config });
    if (denied) {
      console.error(denied);
      process.exit(1);
    }

    // Same posts.require_approval gate the MCP server applies — the CLI is
    // not a way around the posting kit.
    const blocked = await directPostGateError(toolName, parsed.data, { discord, config });
    if (blocked) {
      console.error(blocked);
      process.exit(1);
    }

    // Same per-project tool profile gate the MCP server applies.
    const input = parsed.data as Record<string, unknown>;
    if (typeof input.project === "string") {
      const channelAlias = typeof input.channel === "string" ? input.channel : undefined;
      const profileError = profileGateError(toolName, input.project, channelAlias, config, {
        projectLevelOnly: tool.gatesOwnChannels === true,
      });
      if (profileError) {
        console.error(profileError);
        process.exit(1);
      }
    }

    const ctx = { discord, config };
    const result =
      tool.destructive && isDryRunEnabled(options.dryRun)
        ? await dryRunResult(tool, input, ctx)
        : await tool.handle(parsed.data, ctx);

    if (result.isError) {
      const text = result.content.map((c) => c.text).join("\n");
      console.error(text);
      process.exit(1);
    }

    const text = result.content.map((c) => c.text).join("\n");
    console.log(text);
  } finally {
    await discord.destroy();
  }
}
