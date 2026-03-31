import type { z } from "zod";
import type { PermissionResolvable } from "discord.js";
import type { DiscordClient } from "../client.js";
import type { LoadedConfig } from "../config/index.js";

export interface ToolContext {
  discord: DiscordClient;
  config: LoadedConfig;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  inputSchema: z.ZodType;
  permissions?: PermissionResolvable[];
  destructive?: boolean;
  requiresGuild?: boolean;
  handle: (input: any, ctx: ToolContext) => Promise<ToolResult>;
}

export function toolResult(text: string, isError?: boolean): ToolResult {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

export function toolResultJson(data: unknown, isError?: boolean): ToolResult {
  return toolResult(JSON.stringify(data, null, 2), isError);
}
