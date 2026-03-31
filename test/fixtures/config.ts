import type { GlobalConfig, PerProjectConfig } from "../../src/config/schema.js";

export const testGlobalConfig: GlobalConfig = {
  projects: {
    "clarity-house": {
      guild_id: "1476779123861885081",
      channels: {
        dev: "111111111111111111",
        builds: "222222222222222222",
        releases: "333333333333333333",
        alerts: "444444444444444444",
        "general-updates": "555555555555555555",
      },
      default_channel: "dev",
    },
    helix: {
      guild_id: "1476779123861885081",
      channels: {
        dev: "666666666666666666",
        builds: "777777777777777777",
      },
      default_channel: "dev",
    },
  },
  default_project: "clarity-house",
  notification_routing: {
    ci_build: "builds",
    deploy: "builds",
    release: "releases",
    error: "alerts",
    announcement: "general-updates",
    dev: "dev",
  },
};

export const testPerProjectConfig: PerProjectConfig = {
  project: "helix",
  notification_routing: {
    ci_build: "builds",
    error: "alerts",
  },
};
