import { z } from "zod";
import { defineTool, toolResultJson } from "../types.js";
import { validateConfig } from "../../config/validate.js";

const inputSchema = z.object({});

export const listProjects = defineTool({
  name: "list_projects",
  description:
    "List all configured projects with their guild mappings, channel aliases, token status, and routing config. Essential for understanding multi-org setups.",
  category: "system",
  inputSchema,
  handle: async (_input, ctx) => {
    const validation = validateConfig(ctx.config);

    // token_env name is omitted intentionally — it reveals env var names which aids exfiltration (M-5).
    // token_set (boolean) is sufficient for operators to know if a token is configured.
    const projects = validation.projects.map((p) => ({
      name: p.name,
      guild_id: p.guildId,
      channels: p.channels,
      default_channel: p.defaultChannel ?? null,
      token_set: p.tokenSet,
    }));

    const result: Record<string, unknown> = {
      project_count: projects.length,
      projects,
      default_project: ctx.config.perProject?.project ?? ctx.config.global.default_project ?? null,
      has_default_token: !!ctx.config.defaultToken,
    };

    if (ctx.config.global.notification_routing) {
      result.notification_routing = ctx.config.global.notification_routing;
    }

    if (validation.warnings.length > 0) {
      result.warnings = validation.warnings;
    }

    if (validation.errors.length > 0) {
      result.errors = validation.errors;
    }

    return toolResultJson(result);
  },
});
