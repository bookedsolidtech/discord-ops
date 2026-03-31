import { describe, it, expect, vi } from "vitest";
import { sendMessage } from "../../src/tools/messaging/send-message.js";
import { getMessages } from "../../src/tools/messaging/get-messages.js";
import { editMessage } from "../../src/tools/messaging/edit-message.js";
import { deleteMessage } from "../../src/tools/messaging/delete-message.js";
import { addReaction } from "../../src/tools/messaging/add-reaction.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockMessage,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

describe("send_message", () => {
  it("sends a message via project routing", async () => {
    const ctx = createCtx();
    const result = await sendMessage.handle(
      { content: "Hello world", project: "test-project", channel: "dev" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(ctx.discord.getChannel).toHaveBeenCalledWith("222222222222222222", expect.anything());
  });

  it("sends a message via direct channel_id", async () => {
    const ctx = createCtx();
    const result = await sendMessage.handle(
      { content: "Direct", channel_id: "999999999999999999" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(ctx.discord.getChannel).toHaveBeenCalledWith("999999999999999999", undefined);
  });

  it("returns error for unresolvable routing", async () => {
    const ctx = createCtx();
    ctx.config.global.default_project = undefined;
    ctx.config.global.projects = {};
    const result = await sendMessage.handle({ content: "Oops" }, ctx);
    expect(result.isError).toBe(true);
  });
});

describe("get_messages", () => {
  it("fetches messages from a channel", async () => {
    const ctx = createCtx();
    const result = await getMessages.handle({ channel_id: "222222222222222222", limit: 10 }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.channel_id).toBe("222222222222222222");
  });
});

describe("edit_message", () => {
  it("edits a message", async () => {
    const ctx = createCtx();
    const result = await editMessage.handle(
      { message_id: "111111111111111111", content: "Updated", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
  });
});

describe("delete_message", () => {
  it("deletes a message", async () => {
    const ctx = createCtx();
    const result = await deleteMessage.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("Deleted");
  });
});

describe("add_reaction", () => {
  it("adds a reaction", async () => {
    const ctx = createCtx();
    const result = await addReaction.handle(
      { message_id: "111111111111111111", emoji: "👍", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("Added reaction");
  });
});
