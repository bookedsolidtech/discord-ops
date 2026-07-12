import { MessageType, type Message, type MessageReaction } from "discord.js";

/**
 * Fetch a message, distinguishing "not found" (Unknown Message, code 10008)
 * from other failures (missing permissions, bad routing, network) so polling
 * agents never mistake an access problem for a deleted message.
 */
export async function fetchMessageOrError(
  channel: { messages: { fetch: (id: string) => Promise<Message> } },
  messageId: string,
  channelId: string,
): Promise<{ message: Message } | { error: string }> {
  try {
    return { message: await channel.messages.fetch(messageId) };
  } catch (err) {
    if ((err as { code?: number }).code === 10008) {
      return { error: `Message ${messageId} not found in channel ${channelId}` };
    }
    const detail = err instanceof Error ? err.message : String(err);
    return { error: `Failed to fetch message ${messageId}: ${detail}` };
  }
}

/**
 * Shared per-message serialization used by get_messages, get_message, and
 * get_replies. Includes `reply_to` so agents can trace reply chains back to
 * messages they posted earlier.
 */
export function serializeMessage(msg: Message) {
  return {
    id: msg.id,
    author: msg.author.tag,
    content: msg.content,
    timestamp: msg.createdAt.toISOString(),
    // Only user replies carry reply_to — Discord also sets message_reference
    // on system messages (pin notifications, thread starters, crossposts),
    // which are not replies.
    reply_to: msg.type === MessageType.Reply ? (msg.reference?.messageId ?? null) : null,
    attachments: [...msg.attachments.values()].map((a) => ({
      id: a.id,
      filename: a.name,
      url: a.url,
      size: a.size,
      content_type: a.contentType ?? null,
    })),
    embeds: msg.embeds.map((e) => ({
      title: e.title ?? null,
      description: e.description ?? null,
      url: e.url ?? null,
      color: e.color ?? null,
      fields:
        e.fields?.map((f) => ({ name: f.name, value: f.value, inline: f.inline ?? false })) ?? [],
      author: e.author
        ? { name: e.author.name, url: e.author.url ?? null, icon_url: e.author.iconURL ?? null }
        : null,
      footer: e.footer ? { text: e.footer.text, icon_url: e.footer.iconURL ?? null } : null,
      thumbnail: e.thumbnail ? { url: e.thumbnail.url } : null,
      image: e.image ? { url: e.image.url } : null,
      timestamp: e.timestamp ?? null,
    })),
    reactions: [...(msg.reactions?.cache?.values?.() ?? [])].map((r: MessageReaction) => ({
      // Round-trippable into add_reaction (unicode char or <:name:id>).
      emoji: r.emoji.toString(),
      emoji_name: r.emoji.name,
      count: r.count,
    })),
  };
}
