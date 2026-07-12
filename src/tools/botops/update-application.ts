import { z } from "zod";
import { OAuth2Scopes, PermissionsBitField, type ClientApplicationEditOptions } from "discord.js";
import { toolResult, toolResultJson } from "../types.js";
import { isPublicHttpUrl } from "../../utils/og-fetch.js";
import { defineBotopsTool, resolveApplicationTarget } from "./shared.js";
import { fetchImageAsDataUri, MAX_ICON_BYTES } from "./image-fetch.js";

const publicHttpsUrl = (label: string) =>
  z
    .string()
    .max(512)
    .refine((u) => u.startsWith("https://") && isPublicHttpUrl(u), {
      message: `${label} must be a public HTTPS URL`,
    });

const inputSchema = z.object({
  project: z
    .string()
    .optional()
    .describe(
      "Project name — the project's bot token selects WHICH application is edited (the application of the bot serving this project)",
    ),
  description: z
    .string()
    .max(400)
    .optional()
    .describe("New application description shown on the bot's profile (max 400 chars)"),
  icon_url: z
    .string()
    .max(2048)
    .optional()
    .describe(
      "Public HTTP(S) URL of the new application icon — fetched server-side (max 2MB, png/jpeg/gif/webp) and converted to a data URI. Private/internal URLs are rejected.",
    ),
  tags: z
    .array(z.string().min(1).max(20))
    .max(5)
    .optional()
    .describe("Up to 5 discovery tags (max 20 chars each)"),
  install_params_scopes: z
    .array(z.string().min(1))
    .max(20)
    .optional()
    .describe('OAuth2 scopes for the default install link (e.g. ["bot", "applications.commands"])'),
  install_params_permissions: z
    .string()
    .regex(/^\d+$/, "Must be a permissions bitfield as a decimal string")
    .optional()
    .describe(
      'Permissions bitfield as a decimal string for the default install link (e.g. "277025508352"). Requires install_params_scopes.',
    ),
  interactions_endpoint_url: publicHttpsUrl("interactions_endpoint_url")
    .optional()
    .describe(
      "HTTPS endpoint that receives interactions via outgoing webhook. Discord validates the endpoint (it must ack a PING) or the edit fails.",
    ),
  custom_install_url: publicHttpsUrl("custom_install_url")
    .optional()
    .describe("Custom URL users are sent to when installing the app"),
});

export const updateApplication = defineBotopsTool({
  name: "update_application",
  description:
    "Edit the current Discord application of the bot serving this project — the project's token selects which application is edited. Supports description, icon (fetched from a public URL), tags, default install params, interactions endpoint, and custom install URL, with no developer-portal visit needed. NOTE: global application NAME changes are intentionally NOT supported (rate-limited and verification-sensitive) — for per-guild identity use set_bot_nick or bot personas.",
  category: "botops",
  inputSchema,
  handle: async (input, ctx) => {
    const editableFields = [
      input.description,
      input.icon_url,
      input.tags,
      input.install_params_scopes,
      input.install_params_permissions,
      input.interactions_endpoint_url,
      input.custom_install_url,
    ];
    if (editableFields.every((v) => v === undefined)) {
      return toolResult(
        "Provide at least one field to update: description, icon_url, tags, install_params_scopes, interactions_endpoint_url, or custom_install_url.",
        true,
      );
    }

    if (
      input.install_params_permissions !== undefined &&
      input.install_params_scopes === undefined
    ) {
      return toolResult(
        "install_params_permissions requires install_params_scopes — Discord install params always include scopes.",
        true,
      );
    }

    const target = resolveApplicationTarget(input.project, ctx.config);
    if ("error" in target) {
      return toolResult(target.error, true);
    }

    const editOptions: ClientApplicationEditOptions = {};

    if (input.description !== undefined) editOptions.description = input.description;
    if (input.tags !== undefined) editOptions.tags = input.tags;
    if (input.interactions_endpoint_url !== undefined) {
      editOptions.interactionsEndpointURL = input.interactions_endpoint_url;
    }
    if (input.custom_install_url !== undefined) {
      editOptions.customInstallURL = input.custom_install_url;
    }

    if (input.install_params_scopes !== undefined) {
      const validScopes = new Set<string>(Object.values(OAuth2Scopes));
      const invalid = input.install_params_scopes.filter((s) => !validScopes.has(s));
      if (invalid.length > 0) {
        return toolResult(
          `Invalid OAuth2 scope(s): ${invalid.join(", ")}. Common values: bot, applications.commands, identify.`,
          true,
        );
      }
      editOptions.installParams = {
        scopes: input.install_params_scopes as OAuth2Scopes[],
        permissions: new PermissionsBitField(BigInt(input.install_params_permissions ?? "0")),
      };
    }

    if (input.icon_url !== undefined) {
      const image = await fetchImageAsDataUri(input.icon_url, MAX_ICON_BYTES);
      if (!image.ok) {
        return toolResult(`icon_url rejected: ${image.error}`, true);
      }
      editOptions.icon = image.dataUri;
    }

    const client = await ctx.discord.getClient(target.token);
    const app = client.application;
    if (!app) {
      return toolResult(
        "Bot application unavailable — the Discord client may not be fully ready",
        true,
      );
    }

    const updated = await app.edit(editOptions);

    // Minimal summary only — never the token, and no raw install/auth internals.
    return toolResultJson({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      tags: updated.tags,
      icon_set: Boolean(updated.icon),
    });
  },
});
