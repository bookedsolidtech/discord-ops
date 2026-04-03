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
    pinned: false,
    edit: vi.fn().mockImplementation(async (content: string) => ({
      ...createMockMessage(overrides),
      content,
      editedAt: new Date(),
    })),
    delete: vi.fn().mockResolvedValue(undefined),
    react: vi.fn().mockResolvedValue(undefined),
    pin: vi.fn().mockResolvedValue(undefined),
    unpin: vi.fn().mockResolvedValue(undefined),
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
    bulkDelete: vi.fn().mockImplementation(async (count: number) => {
      const deleted = new Map();
      for (let i = 0; i < count; i++) {
        deleted.set(`msg_${i}`, createMockMessage({ id: `msg_${i}` }));
      }
      return deleted;
    }),
    createWebhook: vi.fn().mockResolvedValue({
      id: "888888888888888888",
      name: "Test Webhook",
      channelId: "222222222222222222",
      guildId: "444444444444444444",
      token: "webhook-token",
      url: "https://discord.com/api/webhooks/888888888888888888/webhook-token",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    }),
    fetchWebhooks: vi.fn().mockResolvedValue(new Map()),
    permissionOverwrites: {
      edit: vi.fn().mockResolvedValue(undefined),
    },
    createInvite: vi.fn().mockResolvedValue({
      code: "abc123",
      maxAge: 86400,
      maxUses: 0,
      temporary: false,
      expiresAt: new Date("2026-01-02T00:00:00Z"),
    }),
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

export function createMockRole(overrides: Record<string, unknown> = {}) {
  return {
    id: "999999999999999999",
    name: "Test Role",
    hexColor: "#000000",
    color: 0,
    position: 1,
    mentionable: false,
    hoist: false,
    managed: false,
    members: { size: 0 },
    permissions: { toArray: () => ["SendMessages"] },
    edit: vi.fn().mockImplementation(async (data: Record<string, unknown>) => ({
      ...createMockRole(overrides),
      ...data,
      hexColor: data.color ?? "#000000",
    })),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function createMockMember(overrides: Record<string, unknown> = {}) {
  const mockRoleCache = new Map([
    ["999999999999999999", { id: "999999999999999999", name: "Test Role", hexColor: "#000000" }],
  ]) as any;
  mockRoleCache.map = vi.fn().mockImplementation((fn: any) => [...mockRoleCache.values()].map(fn));

  return {
    id: "333333333333333333",
    user: {
      id: "333333333333333333",
      tag: "TestUser#0001",
      username: "testuser",
      discriminator: "0001",
      bot: false,
      avatarURL: () => "https://cdn.discordapp.com/avatars/333333333333333333/abc.png",
    },
    displayName: "TestUser",
    joinedAt: new Date("2025-06-01T00:00:00Z"),
    premiumSince: null,
    permissions: { toArray: () => ["SendMessages", "ViewChannel"], has: () => true },
    roles: {
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      cache: mockRoleCache,
    },
    kick: vi.fn().mockResolvedValue(undefined),
    ban: vi.fn().mockResolvedValue(undefined),
    timeout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function createMockWebhook(overrides: Record<string, unknown> = {}) {
  return {
    id: "888888888888888888",
    name: "Test Webhook",
    channelId: "222222222222222222",
    guildId: "444444444444444444",
    type: 1,
    avatar: null,
    token: "webhook-token",
    url: "https://discord.com/api/webhooks/888888888888888888/webhook-token",
    owner: { id: "333333333333333333", tag: "TestUser#0001" },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    edit: vi.fn().mockImplementation(async (data: Record<string, unknown>) => ({
      ...createMockWebhook(overrides),
      ...data,
    })),
    delete: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(createMockMessage()),
    ...overrides,
  };
}

export function createMockAuditLogEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "101010101010101010",
    action: 20, // MemberKick
    executor: { id: "333333333333333333", tag: "Admin#0001" },
    target: { id: "444444444444444444" },
    reason: "Test reason",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    changes: [],
    ...overrides,
  };
}

export function createMockGuild(overrides: Record<string, unknown> = {}) {
  const mockRole = createMockRole();
  const mockMember = createMockMember();

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
      fetchActiveThreads: vi.fn().mockImplementation(async () => {
        const threadsMap = new Map() as any;
        threadsMap.map = vi.fn().mockImplementation((fn: any) => [...threadsMap.values()].map(fn));
        return { threads: threadsMap };
      }),
      create: vi.fn().mockResolvedValue(createMockChannel()),
    },
    members: {
      fetch: vi.fn().mockImplementation(async (idOrOptions?: unknown) => {
        if (typeof idOrOptions === "string") {
          return createMockMember({
            id: idOrOptions,
            user: { id: idOrOptions, tag: "TestUser#0001" },
          });
        }
        return new Map([["333333333333333333", mockMember]]);
      }),
      fetchMe: vi.fn().mockResolvedValue({
        permissions: { toArray: () => ["SendMessages", "ViewChannel"] },
      }),
      ban: vi.fn().mockResolvedValue(undefined),
      unban: vi.fn().mockResolvedValue(undefined),
    },
    roles: {
      fetch: vi.fn().mockImplementation(async (id?: string) => {
        if (id) {
          return createMockRole({ id });
        }
        // discord.js Collection extends Map and has .map()
        const rolesMap = new Map([["999999999999999999", mockRole]]) as any;
        rolesMap.map = vi.fn().mockImplementation((fn: any) => [...rolesMap.values()].map(fn));
        rolesMap.get = vi.fn().mockImplementation((key: string) => {
          if (key === "999999999999999999") return mockRole;
          return undefined;
        });
        return rolesMap;
      }),
      create: vi.fn().mockResolvedValue(mockRole),
    },
    invites: {
      fetch: vi.fn().mockImplementation(async () => {
        const inviteData = {
          code: "abc123",
          channel: { name: "test-channel" },
          channelId: "222222222222222222",
          inviter: { tag: "TestUser#0001" },
          uses: 5,
          maxUses: 10,
          maxAge: 86400,
          temporary: false,
          createdAt: new Date("2026-01-01T00:00:00Z"),
          expiresAt: new Date("2026-01-02T00:00:00Z"),
        };
        const invitesMap = new Map([["abc123", inviteData]]) as any;
        invitesMap.map = vi.fn().mockImplementation((fn: any) => [...invitesMap.values()].map(fn));
        return invitesMap;
      }),
    },
    fetchWebhooks: vi.fn().mockResolvedValue(new Map()),
    fetchAuditLogs: vi.fn().mockImplementation(async () => {
      const entry = createMockAuditLogEntry();
      const entriesMap = new Map([["101010101010101010", entry]]) as any;
      entriesMap.map = vi.fn().mockImplementation((fn: any) => [...entriesMap.values()].map(fn));
      return { entries: entriesMap };
    }),
    ...overrides,
  };
}

export function createMockDiscordClient(overrides: Record<string, unknown> = {}) {
  const mockChannel = createMockChannel();
  const mockGuild = createMockGuild();
  const mockWebhook = createMockWebhook();

  return {
    isConnected: true,
    getClient: vi.fn().mockResolvedValue({
      user: { tag: "TestBot#0001", id: "100000000000000000" },
      guilds: {
        cache: new Map([["444444444444444444", mockGuild]]),
        size: 1,
      },
      uptime: 60000,
      isReady: () => true,
      fetchWebhook: vi.fn().mockResolvedValue(mockWebhook),
    }),
    getChannel: vi.fn().mockResolvedValue(mockChannel),
    getAnyChannel: vi.fn().mockResolvedValue(mockChannel),
    getGuild: vi.fn().mockResolvedValue(mockGuild),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

export function createMockConfig() {
  return {
    defaultToken: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.XXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXX0000",
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
