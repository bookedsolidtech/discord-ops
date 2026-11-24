import type { LoadedConfig } from "./index.js";

export interface SenderCheck {
  /** Why the webhooks must not be deleted yet; undefined when they may be. */
  refusal?: string;
  /** Every sender the inventory lists for the checked webhooks. */
  senders: string[];
}

/** True when any project keeps a webhook_senders inventory. */
export function hasSenderInventory(config: LoadedConfig): boolean {
  return Object.values(config.global.projects).some((p) => p.webhook_senders);
}

/** Names of the projects in this guild that keep a webhook_senders inventory. */
export function inventoryProjects(guildId: string, config: LoadedConfig): string[] {
  return Object.entries(config.global.projects)
    .filter(([, p]) => p.guild_id === guildId && p.webhook_senders)
    .map(([name]) => name);
}

/**
 * Checks webhooks about to be deleted against the webhook_senders inventory of
 * every project in their guild. A webhook with listed senders, or listed by no
 * project, is refused. A guild with no inventory is never refused.
 */
export function checkWebhookSenders(
  webhooks: Array<{ id: string; name: string | null }>,
  guildId: string,
  config: LoadedConfig,
): SenderCheck {
  const projects = inventoryProjects(guildId, config);
  if (projects.length === 0) return { senders: [] };

  const problems: string[] = [];
  const senders: string[] = [];
  for (const { id, name } of webhooks) {
    const listed = projects.flatMap((p) => {
      const entry = config.global.projects[p]?.webhook_senders?.[id];
      return entry ? [entry] : [];
    });
    const found = listed.flat();
    senders.push(...found);
    if (listed.length === 0) {
      problems.push(
        `webhook "${name}" (${id}) is not in the webhook_senders inventory of ` +
          `${projects.map((p) => `"${p}"`).join(", ")}, so its senders are unknown`,
      );
    } else if (found.length > 0) {
      problems.push(
        `webhook "${name}" (${id}) has ${found.length} listed sender(s): ${found.join("; ")}`,
      );
    }
  }
  if (problems.length === 0) return { senders };
  return {
    senders,
    refusal:
      `${problems.join(". ")}. Stop or repoint every sender, then pass senders_retired: true ` +
      "(or record an empty list in webhook_senders).",
  };
}

/** Suffix for a success message, naming the senders the caller confirmed retired. */
export function retiredNote(senders: string[]): string {
  return senders.length > 0 ? `. Senders confirmed retired: ${senders.join("; ")}` : "";
}
