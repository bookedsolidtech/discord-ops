import { loadConfig } from "../config/index.js";
import { DiscordClient } from "../client.js";
import { allTools } from "../tools/index.js";

export async function runTool(toolName: string, rawArgs: string): Promise<void> {
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
  const discord = new DiscordClient(config.defaultToken);

  try {
    const result = await tool.handle(parsed.data, { discord, config });

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
