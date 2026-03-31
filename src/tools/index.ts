import type { ToolDefinition } from "./types.js";

// Messaging
import { sendMessage } from "./messaging/send-message.js";
import { getMessages } from "./messaging/get-messages.js";
import { editMessage } from "./messaging/edit-message.js";
import { deleteMessage } from "./messaging/delete-message.js";
import { addReaction } from "./messaging/add-reaction.js";

// Channels
import { listChannels } from "./channels/list-channels.js";
import { getChannel } from "./channels/get-channel.js";
import { createChannel } from "./channels/create-channel.js";
import { editChannel } from "./channels/edit-channel.js";
import { deleteChannel } from "./channels/delete-channel.js";

// Guilds
import { listGuilds } from "./guilds/list-guilds.js";
import { getGuild } from "./guilds/get-guild.js";

// Members
import { listMembers } from "./members/list-members.js";
import { getMember } from "./members/get-member.js";

// Roles
import { listRoles } from "./roles/list-roles.js";

// Threads
import { createThread } from "./threads/create-thread.js";
import { listThreads } from "./threads/list-threads.js";

// System
import { healthCheck } from "./health-check.js";

export const allTools: ToolDefinition[] = [
  sendMessage,
  getMessages,
  editMessage,
  deleteMessage,
  addReaction,
  listChannels,
  getChannel,
  createChannel,
  editChannel,
  deleteChannel,
  listGuilds,
  getGuild,
  listMembers,
  getMember,
  listRoles,
  createThread,
  listThreads,
  healthCheck,
];
