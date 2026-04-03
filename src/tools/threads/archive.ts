import { z } from "zod";
import type { ThreadChannel } from "discord.js";
import type { ToolDefinition } from "../types.js";
import { toolResult } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  thread_id: snowflakeId.describe("Thread ID to archive"),
  locked: z.boolean().default(false).describe("Whether to lock the thread (prevent new messages)"),
  project: z.string().optional().describe("Project name for token resolution"),
});

export const archiveThread: ToolDefinition = {
  name: "archive_thread",
  description:
    "Archive a thread, optionally locking it to prevent new messages. Archived threads are hidden from the channel list but can be unarchived.",
  category: "threads",
  inputSchema,
  permissions: ["ManageThreads"],
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const channel = await ctx.discord.getAnyChannel(input.thread_id, token);

    if (!channel.isThread()) {
      return toolResult(`Channel ${input.thread_id} is not a thread`, true);
    }

    const thread = channel as ThreadChannel;
    await thread.setArchived(true);
    if (input.locked) {
      await thread.setLocked(true);
    }

    return toolResult(`Archived thread "${thread.name}"${input.locked ? " (locked)" : ""}`);
  },
};
