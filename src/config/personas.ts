import {
  DEFAULT_PREVIEW_CHANNEL,
  type PersonaPreset,
  type PostType,
  type ProjectConfig,
} from "./schema.js";

export interface MatchedPreset {
  key: string;
  preset: PersonaPreset;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Finds a persona preset in a project by key or display name, case-insensitive.
 * A key match wins over a name match so a preset key is always addressable.
 */
export function findPreset(
  project: Pick<ProjectConfig, "personas"> | undefined,
  personaOrKey: string,
): MatchedPreset | undefined {
  const presets = project?.personas;
  if (!presets) return undefined;
  const wanted = normalize(personaOrKey);
  if (!wanted) return undefined;

  for (const [key, preset] of Object.entries(presets)) {
    if (normalize(key) === wanted) return { key, preset };
  }
  for (const [key, preset] of Object.entries(presets)) {
    if (normalize(preset.name) === wanted) return { key, preset };
  }
  return undefined;
}

/**
 * Safe, agent-facing summary of a project's presets. Never carries webhook
 * tokens or URLs (presets do not hold any), and reports only whether an avatar
 * is configured rather than echoing the URL.
 */
export function serializePresets(project: Pick<ProjectConfig, "personas"> | undefined) {
  return Object.entries(project?.personas ?? {}).map(([key, preset]) => ({
    key,
    name: preset.name,
    has_avatar: preset.avatar_url !== undefined,
    color: preset.color ?? null,
    default_channel: preset.default_channel ?? null,
  }));
}

export interface ResolvedPostsConfig {
  previewChannel: string;
  approverUserIds: string[];
  approverRoleIds: string[];
  /** Types send_post may publish directly, without a ✅. */
  autoTypes: PostType[];
  requireApproval: boolean;
}

/** Applies posting-kit defaults to a project's optional `posts` block. */
export function resolvePostsConfig(
  project: Pick<ProjectConfig, "posts" | "owners"> | undefined,
): ResolvedPostsConfig {
  const posts = project?.posts;
  return {
    previewChannel: posts?.preview_channel ?? DEFAULT_PREVIEW_CHANNEL,
    // Approver user ids are the configured list plus the project's owners.
    approverUserIds: [
      ...new Set([...(posts?.approver_user_ids ?? []), ...(project?.owners ?? [])]),
    ],
    approverRoleIds: [...new Set(posts?.approver_role_ids ?? [])],
    autoTypes: [...new Set(posts?.auto_types ?? [])],
    requireApproval: posts?.require_approval === true,
  };
}

/**
 * Fills an embed's color and footer text from a preset, only where the embed
 * leaves them unset. Returns a new object; the input is not mutated.
 */
export function applyPresetEmbedDefaults<T extends { color?: number; footer?: { text: string } }>(
  embed: T,
  preset: PersonaPreset | undefined,
): T {
  if (!preset) return embed;
  const out = { ...embed };
  if (out.color === undefined && preset.color !== undefined) out.color = preset.color;
  if (!out.footer?.text && preset.footer) out.footer = { ...out.footer, text: preset.footer };
  return out;
}
