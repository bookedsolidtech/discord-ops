import { vi } from "vitest";

/**
 * Mock discord.js client for testing tools without a real Discord connection.
 */

export function createMockMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "111111111111111111",
    channelId: "222222222222222222",
    content: "Test message",
    author: { tag: "TestBot#0001", id: "333333333333333333" },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    editedAt: null,
    attachments: { size: 0 },
    embeds: [],
    reactions: { cache: [] },
    edit: vi.fn().mockImplementation(async (content: string) => ({
      ...createMockMessage(overrides),
      content,
      editedAt: new Date(),
    })),
    delete: vi.fn().mockResolvedValue(undefined),
    react: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn(),
    ...overrides,
  };
}

export function createMockChannel(overrides: Record<string, unknown> = {}) {
  const mockMessage = createMockMessage();
  return {
    id: "222222222222222222",
    name: "test-channel",
    type: 0, // GuildText
    position: 0,
    parentId: null,
    guildId: "444444444444444444",
    topic: null,
    nsfw: false,
    rateLimitPerUser: 0,
    isTextBased: () => true,
    send: vi.fn().mockResolvedValue(mockMessage),
    messages: {
      fetch: vi.fn().mockImplementation(async (idOrOptions?: unknown) => {
        if (typeof idOrOptions === "string") {
          return createMockMessage({ id: idOrOptions });
        }
        return new Map([["111111111111111111", mockMessage]]);
      }),
    },
    edit: vi.fn().mockImplementation(async (data: Record<string, unknown>) => ({
      ...createMockChannel(overrides),
      ...data,
    })),
    delete: vi.fn().mockResolvedValue(undefined),
    threads: {
      create: vi.fn().mockResolvedValue({
        id: "555555555555555555",
        name: "test-thread",
        parentId: "222222222222222222",
        archived: false,
        autoArchiveDuration: 1440,
      }),
    },
    ...overrides,
  };
}

export function createMockGuild(overrides: Record<string, unknown> = {}) {
  return {
    id: "444444444444444444",
    name: "Test Guild",
    description: "A test guild",
    memberCount: 10,
    iconURL: () => null,
    bannerURL: () => null,
    ownerId: "333333333333333333",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    features: [],
    premiumTier: 0,
    premiumSubscriptionCount: 0,
    verificationLevel: 0,
    channels: {
      fetch: vi.fn().mockResolvedValue(new Map()),
      fetchActiveThreads: vi.fn().mockResolvedValue({ threads: new Map() }),
      create: vi.fn().mockResolvedValue(createMockChannel()),
    },
    members: {
      fetch: vi.fn().mockResolvedValue(new Map()),
      fetchMe: vi.fn().mockResolvedValue({
        permissions: { toArray: () => ["SendMessages", "ViewChannel"] },
      }),
    },
    roles: {
      fetch: vi.fn().mockResolvedValue(new Map()),
    },
    ...overrides,
  };
}

export function createMockDiscordClient(overrides: Record<string, unknown> = {}) {
  const mockChannel = createMockChannel();
  const mockGuild = createMockGuild();

  return {
    isConnected: true,
    getClient: vi.fn().mockResolvedValue({
      user: { tag: "TestBot#0001" },
      guilds: {
        cache: new Map([["444444444444444444", mockGuild]]),
        size: 1,
      },
      uptime: 60000,
      isReady: () => true,
    }),
    getChannel: vi.fn().mockResolvedValue(mockChannel),
    getGuild: vi.fn().mockResolvedValue(mockGuild),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

export function createMockConfig() {
  return {
    token: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.XXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXX0000",
    global: {
      projects: {
        "test-project": {
          guild_id: "444444444444444444",
          channels: {
            dev: "222222222222222222",
            builds: "666666666666666666",
            alerts: "777777777777777777",
          },
          default_channel: "dev",
        },
      },
      default_project: "test-project",
      notification_routing: {
        ci_build: "builds",
        error: "alerts",
        dev: "dev",
      },
    },
    perProject: undefined,
  };
}
