import { z } from "zod";
import { defineTool, toolResultJson } from "../types.js";
import { listTemplates } from "../../templates/registry.js";

const inputSchema = z.object({
  category: z
    .enum(["devops", "team", "all"])
    .optional()
    .describe("Filter by category: devops, team, or all (default: all)"),
});

export const listTemplatesCmd = defineTool({
  name: "list_templates",
  description:
    "List all available message templates with their required/optional variables. Use with send_template to send formatted Discord embeds.",
  category: "messaging",
  inputSchema,
  handle: async (input, _ctx) => {
    let allTemplates = listTemplates();

    if (input.category && input.category !== "all") {
      allTemplates = allTemplates.filter((t) => t.category === input.category);
    }

    const result = allTemplates.map((t) => ({
      name: t.name,
      category: t.category,
      description: t.description,
      required_vars: t.requiredVars,
      optional_vars: t.optionalVars,
      ...(t.features ? { features: t.features } : {}),
    }));

    return toolResultJson({
      count: result.length,
      templates: result,
    });
  },
});
