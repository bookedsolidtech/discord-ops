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
  // interactions_endpoint_url is deliberately NOT exposed here. It is a bot
  // control-plane field: pointing it at an attacker URL hands over every
  // future interaction payload (tokens, user data) and lets the attacker
  // respond as the bot. An agent that ingests untrusted channel content must
  // never be one prompt-injection away from redirecting the control plane.
  // If interactions are ever supported, they belong behind a separate
  // opt-in tool that only accepts URLs matching trusted config.
  custom_install_url: publicHttpsUrl("custom_install_url")
    .optional()
    .describe("Custom URL users are sent to when installing the app (install-page redirect only)"),
});

export const updateApplication = defineBotopsTool({
  name: "update_application",
  description:
    "Edit the current Discord application of the bot serving this project — the project's token selects which application is edited. Supports description, icon (fetched from a public URL), tags, default install params, and custom install URL, with no developer-portal visit needed. Changes are application-GLOBAL (they apply in every guild the app is in), unlike the per-guild rest of this surface. NOTE: global application NAME changes and the interactions endpoint are intentionally NOT supported (name is rate-limited/verification-sensitive; the interactions endpoint is a control-plane field kept out of agent reach) — for per-guild identity use set_bot_nick or bot personas.",
  category: "botops",
  inputSchema,
  handle: async (input, ctx) => {
    const editableFields = [
      input.description,
      input.icon_url,
      input.tags,
      input.install_params_scopes,
      input.install_params_permissions,
      input.custom_install_url,
    ];
    if (editableFields.every((v) => v === undefined)) {
      return toolResult(
        "Provide at least one field to update: description, icon_url, tags, install_params_scopes, or custom_install_url.",
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
    if (input.custom_install_url !== undefined) {
      editOptions.customInstallURL = input.custom_install_url;
    }

    // Validate scopes up front (pure input validation) — the installParams
    // object is assembled after the app is fetched so we can preserve existing
    // permissions when only scopes are updated.
    if (input.install_params_scopes !== undefined) {
      const validScopes = new Set<string>(Object.values(OAuth2Scopes));
      const invalid = input.install_params_scopes.filter((s) => !validScopes.has(s));
      if (invalid.length > 0) {
        return toolResult(
          `Invalid OAuth2 scope(s): ${invalid.join(", ")}. Common values: bot, applications.commands, identify.`,
          true,
        );
      }
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

    if (input.install_params_scopes !== undefined) {
      // Only rewrite the permission bitfield when the caller supplied one.
      // Sending permissions: 0 for a scopes-only update would silently strip
      // the app's existing install permissions, so default to the current
      // configured permissions.
      const permissions =
        input.install_params_permissions !== undefined
          ? new PermissionsBitField(BigInt(input.install_params_permissions))
          : (app.installParams?.permissions ?? new PermissionsBitField(0n));
      editOptions.installParams = {
        scopes: input.install_params_scopes as OAuth2Scopes[],
        permissions,
      };
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
