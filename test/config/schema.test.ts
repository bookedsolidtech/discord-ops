import { describe, it, expect } from "vitest";
import {
  notificationType,
  GlobalConfigSchema,
  PerProjectConfigSchema,
} from "../../src/config/schema.js";

describe("notificationType", () => {
  it("accepts built-in types", () => {
    for (const builtin of [
      "ci_build",
      "deploy",
      "release",
      "error",
      "alert",
      "announcement",
      "dev",
    ]) {
      expect(notificationType.safeParse(builtin).success).toBe(true);
    }
  });

  it("accepts custom notification type 'security'", () => {
    const result = notificationType.safeParse("security");
    expect(result.success).toBe(true);
  });

  it("accepts arbitrary custom strings", () => {
    expect(notificationType.safeParse("my_custom_event").success).toBe(true);
    expect(notificationType.safeParse("incident").success).toBe(true);
  });
});

describe("GlobalConfigSchema with custom notification_routing keys", () => {
  it("accepts a custom notification type as a routing key", () => {
    const result = GlobalConfigSchema.safeParse({
      projects: {
        "clarity-house": {
          guild_id: "123456789012345678",
          channels: { alerts: "987654321098765432" },
        },
      },
      notification_routing: {
        security: "alerts",
        ci_build: "alerts",
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("PerProjectConfigSchema with custom notification_routing keys", () => {
  it("accepts a custom notification type as a routing key", () => {
    const result = PerProjectConfigSchema.safeParse({
      project: "clarity-house",
      notification_routing: {
        security: "alerts",
      },
    });
    expect(result.success).toBe(true);
  });
});
