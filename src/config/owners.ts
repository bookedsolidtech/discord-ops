import type { LoadedConfig } from "./index.js";

/**
 * Returns a space-separated string of `<@userId>` mentions for a project's owners
 * if the given notification type is in `notify_owners_on`. Returns empty string otherwise.
 * `notification_type: "dev"` never triggers pings regardless of config.
 */
export function buildOwnerMentions(
  project: string | undefined,
  notificationType: string | undefined,
  config: LoadedConfig,
): string {
  if (!project || !notificationType || notificationType === "dev") return "";
  const projectConfig = config.global.projects[project];
  if (!projectConfig?.owners?.length || !projectConfig?.notify_owners_on?.length) return "";
  if (!projectConfig.notify_owners_on.includes(notificationType as never)) return "";
  return projectConfig.owners.map((id) => `<@${id}>`).join(" ");
}
