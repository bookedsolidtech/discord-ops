import type { LoadedConfig } from "./index.js";
import type { NotificationType } from "./schema.js";

/**
 * Returns a space-separated string of `<@userId>` mentions for a project's owners
 * if the given notification type is in `notify_owners_on`. Returns empty string if the
 * project exists but has no owners or the notification type is not listed. Returns null
 * if the project does not exist in config.
 * `notification_type: "dev"` never triggers pings regardless of config.
 */
export function buildOwnerMentions(
  project: string | undefined,
  notificationType: NotificationType | undefined,
  config: LoadedConfig,
): string | null {
  if (!project || !notificationType || notificationType === "dev") return "";
  const projectConfig = config.global.projects[project];
  if (!projectConfig) return null;
  if (!projectConfig.owners?.length || !projectConfig.notify_owners_on?.length) return "";
  if (!projectConfig.notify_owners_on.includes(notificationType)) return "";
  return projectConfig.owners.map((id) => `<@${id}>`).join(" ");
}
