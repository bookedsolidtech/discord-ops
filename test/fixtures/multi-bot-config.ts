import type { GlobalConfig } from "../../src/config/schema.js";

/** Multi-bot config fixture with bot personas and channel overrides */
export const multiBotGlobalConfig: GlobalConfig = {
  bots: {
    claire: {
      name: "Claire",
      role: "Community helper",
      token_env: "CLAIRE_TOKEN",
      default_profile: "messaging",
    },
    courier: {
      name: "Clarity Courier",
      role: "Technical operations",
      token_env: "COURIER_TOKEN",
      default_profile: "full",
    },
  },
  projects: {
    "clarity-house": {
      guild_id: "900000000000000001",
      bot: "courier",
      channels: {
        general: "111111111111111111",
        support: { id: "222222222222222222", bot: "claire" },
        "dev-ops": "333333333333333333",
        "ai-testing": { id: "444444444444444444", bot: "claire" },
      },
      default_channel: "dev-ops",
      tool_profile: "full",
    },
    helix: {
      guild_id: "900000000000000002",
      channels: {
        dev: "555555555555555555",
        builds: "666666666666666666",
      },
      default_channel: "dev",
    },
  },
  default_project: "clarity-house",
  notification_routing: {
    error: "dev-ops",
    dev: "general",
  },
};
