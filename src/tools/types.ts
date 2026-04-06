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

export type ToolCategory =
  | "messaging"
  | "channels"
  | "moderation"
  | "roles"
  | "webhooks"
  | "guilds"
  | "members"
  | "threads"
  | "system";

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: z.ZodType;
  permissions?: PermissionResolvable[];
  destructive?: boolean;
  requiresGuild?: boolean;
  /**
   * The erased handle type at the interface level. `input` is typed as `any`
   * here because `ToolDefinition` is not generic over its input schema — the
   * schema type parameter is lost when tools are collected into `ToolDefinition[]`.
   * Use `defineTool` to author new tools: it captures `z.infer<TSchema>` at the
   * call site and narrows `input` inside `handle` before casting the result down
   * to this interface.
   */
  handle: (input: any, ctx: ToolContext) => Promise<ToolResult>;
}

/**
 * Type-safe tool factory. Authors receive a properly-typed `input: z.infer<TSchema>`
 * inside `handle`, while the returned object satisfies `ToolDefinition` via a
 * single cast that erases the schema type parameter.
 */
export function defineTool<TSchema extends z.ZodType>(definition: {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: TSchema;
  permissions?: PermissionResolvable[];
  destructive?: boolean;
  requiresGuild?: boolean;
  handle: (input: z.infer<TSchema>, ctx: ToolContext) => Promise<ToolResult>;
}): ToolDefinition {
  return definition as ToolDefinition;
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
