import type { ToolDefinition } from "./types.js";

// Messaging
import { sendMessage } from "./messaging/send-message.js";
import { getMessages } from "./messaging/get-messages.js";
import { editMessage } from "./messaging/edit-message.js";
import { deleteMessage } from "./messaging/delete-message.js";
import { addReaction } from "./messaging/add-reaction.js";
import { pinMessage } from "./messaging/pin.js";
import { unpinMessage } from "./messaging/unpin.js";
import { searchMessages } from "./messaging/search.js";
import { sendTemplate } from "./messaging/send-template.js";
import { sendEmbed } from "./messaging/send-embed.js";
import { listTemplatesCmd } from "./messaging/list-templates.js";
import { notifyOwners } from "./messaging/notify-owners.js";

// Channels
import { listChannels } from "./channels/list-channels.js";
import { getChannel } from "./channels/get-channel.js";
import { createChannel } from "./channels/create-channel.js";
import { editChannel } from "./channels/edit-channel.js";
import { moveChannel } from "./channels/move-channel.js";
import { deleteChannel } from "./channels/delete-channel.js";
import { purgeMessages } from "./channels/purge-messages.js";
import { setSlowmode } from "./channels/set-slowmode.js";
import { setPermissions } from "./channels/permissions.js";

// Guilds
import { listGuilds } from "./guilds/list-guilds.js";
import { getGuild } from "./guilds/get-guild.js";
import { getInvites } from "./guilds/invites.js";
import { createInvite } from "./guilds/invites.js";

// Members
import { listMembers } from "./members/list-members.js";
import { getMember } from "./members/get-member.js";

// Roles
import { listRoles } from "./roles/list-roles.js";
import { createRole } from "./roles/create-role.js";
import { editRole } from "./roles/edit-role.js";
import { deleteRole } from "./roles/delete-role.js";
import { assignRole } from "./roles/assign-role.js";

// Threads
import { createThread } from "./threads/create-thread.js";
import { listThreads } from "./threads/list-threads.js";
import { archiveThread } from "./threads/archive.js";

// Moderation
import { kickMember } from "./moderation/kick-member.js";
import { banMember } from "./moderation/ban-member.js";
import { unbanMember } from "./moderation/unban-member.js";
import { timeoutMember } from "./moderation/timeout-member.js";

// Webhooks
import { createWebhook } from "./webhooks/create-webhook.js";
import { getWebhook } from "./webhooks/get-webhook.js";
import { listWebhooks } from "./webhooks/list-webhooks.js";
import { editWebhook } from "./webhooks/edit-webhook.js";
import { deleteWebhook } from "./webhooks/delete-webhook.js";
import { executeWebhook } from "./webhooks/execute-webhook.js";

// Audit
import { queryAuditLog } from "./audit/query-audit-log.js";

// System
import { healthCheck } from "./health-check.js";
import { listProjects } from "./system/list-projects.js";

export const allTools: ToolDefinition[] = [
  // Messaging
  sendMessage,
  getMessages,
  editMessage,
  deleteMessage,
  addReaction,
  pinMessage,
  unpinMessage,
  searchMessages,
  sendTemplate,
  sendEmbed,
  listTemplatesCmd,
  notifyOwners,

  // Channels
  listChannels,
  getChannel,
  createChannel,
  editChannel,
  moveChannel,
  deleteChannel,
  purgeMessages,
  setSlowmode,
  setPermissions,

  // Guilds
  listGuilds,
  getGuild,
  getInvites,
  createInvite,

  // Members
  listMembers,
  getMember,

  // Roles
  listRoles,
  createRole,
  editRole,
  deleteRole,
  assignRole,

  // Threads
  createThread,
  listThreads,
  archiveThread,

  // Moderation
  kickMember,
  banMember,
  unbanMember,
  timeoutMember,

  // Webhooks
  createWebhook,
  getWebhook,
  listWebhooks,
  editWebhook,
  deleteWebhook,
  executeWebhook,

  // Audit
  queryAuditLog,

  // System
  healthCheck,
  listProjects,
];
