import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  listTemplates,
  getTemplate,
  templates,
} from "../../src/templates/registry.js";

describe("template registry", () => {
  it("lists all templates", () => {
    const all = listTemplates();
    expect(all.length).toBeGreaterThanOrEqual(23);
  });

  it("gets a specific template", () => {
    const t = getTemplate("release");
    expect(t).toBeDefined();
    expect(t!.name).toBe("release");
    expect(t!.category).toBe("devops");
    expect(t!.requiredVars).toContain("version");
  });

  it("returns undefined for unknown template", () => {
    expect(getTemplate("nonexistent")).toBeUndefined();
  });

  it("throws for unknown template in renderTemplate", () => {
    expect(() => renderTemplate("nonexistent", {})).toThrow("Unknown template");
  });

  it("throws when required vars are missing", () => {
    expect(() => renderTemplate("release", {})).toThrow("requires: version");
  });

  it("all templates have category, description, and render function", () => {
    for (const [name, t] of Object.entries(templates)) {
      expect(t.name).toBe(name);
      expect(t.category).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(typeof t.render).toBe("function");
      expect(Array.isArray(t.requiredVars)).toBe(true);
      expect(Array.isArray(t.optionalVars)).toBe(true);
    }
  });

  it("all templates include features array", () => {
    for (const [, t] of Object.entries(templates)) {
      // features is optional but when present must be an array
      if (t.features) {
        expect(Array.isArray(t.features)).toBe(true);
      }
    }
  });
});

describe("template rendering — devops", () => {
  it("renders release template with author branding", () => {
    const result = renderTemplate("release", {
      version: "1.0.0",
      name: "My App",
      notes: "First stable release!",
      npm: "my-app@1.0.0",
      link: "https://github.com/example/releases/v1.0.0",
    });

    expect(result.embeds).toHaveLength(1);
    const embed = result.embeds[0];
    expect(embed.title).toContain("1.0.0");
    expect(embed.title).toContain("My App");
    expect(embed.description).toContain("First stable");
    expect(embed.color).toBe(0x57f287);
    expect(embed.author?.name).toBe("Release Pipeline");
    expect(embed.url).toBe("https://github.com/example/releases/v1.0.0");
    expect(embed.fields?.some((f) => f.value.includes("npm install"))).toBe(true);
    // Link buttons
    expect(result.components).toBeDefined();
    expect(result.components!.length).toBeGreaterThanOrEqual(1);
    expect(result.components![0].buttons.some((b) => b.label === "Release Notes")).toBe(true);
  });

  it("renders release with custom author", () => {
    const result = renderTemplate("release", {
      version: "2.0.0",
      author_name: "Clarity CI",
      author_icon: "https://example.com/icon.png",
    });
    const embed = result.embeds[0];
    expect(embed.author?.name).toBe("Clarity CI");
    expect(embed.author?.icon_url).toBe("https://example.com/icon.png");
  });

  it("renders deploy success template with footer icon", () => {
    const result = renderTemplate("deploy", {
      status: "success",
      environment: "production",
      version: "2.0.0",
      duration: "45s",
      url: "https://example.com/deploy/123",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("✅");
    expect(embed.title).toContain("Succeeded");
    expect(embed.color).toBe(0x57f287);
    expect(embed.footer?.icon_url).toBeDefined();
    expect(embed.url).toBe("https://example.com/deploy/123");
    expect(embed.author?.name).toBe("Deployment Pipeline");
    expect(result.components).toBeDefined();
  });

  it("renders deploy failure template", () => {
    const result = renderTemplate("deploy", { status: "failed" });
    const embed = result.embeds[0];
    expect(embed.title).toContain("❌");
    expect(embed.color).toBe(0xed4245);
    expect(embed.footer?.icon_url).toBeDefined();
  });

  it("renders deploy with logs button", () => {
    const result = renderTemplate("deploy", {
      url: "https://example.com/deploy",
      logs_url: "https://example.com/logs",
    });
    expect(result.components).toBeDefined();
    expect(result.components![0].buttons).toHaveLength(2);
    expect(result.components![0].buttons.some((b) => b.label === "View Logs")).toBe(true);
  });

  it("renders ci_build passed template with author", () => {
    const result = renderTemplate("ci_build", {
      status: "passed",
      branch: "main",
      tests: "210 passed",
      coverage: "87%",
      url: "https://ci.example.com/build/42",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("🟢");
    expect(embed.title).toContain("main");
    expect(embed.author?.name).toBe("CI Pipeline");
    expect(embed.footer?.icon_url).toBeDefined();
    expect(embed.fields?.some((f) => f.value === "210 passed")).toBe(true);
    expect(embed.fields?.some((f) => f.value === "87%")).toBe(true);
    expect(result.components).toBeDefined();
  });

  it("renders incident template with severity colors", () => {
    const result = renderTemplate("incident", {
      title: "API Outage",
      severity: "critical",
      status: "investigating",
      service: "api-gateway",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("API Outage");
    expect(embed.color).toBe(0xed4245);
    expect(embed.author?.name).toBe("Incident Management");
    expect(embed.footer?.icon_url).toBeDefined();
  });

  it("renders incident with Discord timestamp", () => {
    const result = renderTemplate("incident", {
      title: "DB Down",
      started_at: "2024-03-15T14:30:00Z",
    });
    const embed = result.embeds[0];
    const startField = embed.fields?.find((f) => f.name === "Started");
    expect(startField).toBeDefined();
    expect(startField!.value).toContain("<t:");
  });

  it("renders incident_resolved template with postmortem button", () => {
    const result = renderTemplate("incident_resolved", {
      title: "API Outage",
      duration: "23 minutes",
      root_cause: "Database connection pool exhaustion",
      url: "https://example.com/postmortem/123",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("Resolved");
    expect(embed.color).toBe(0x57f287);
    expect(embed.author?.name).toBe("Incident Management");
    expect(embed.fields?.some((f) => f.value.includes("connection pool"))).toBe(true);
    expect(result.components).toBeDefined();
    expect(result.components![0].buttons[0].label).toBe("Postmortem");
  });

  it("renders maintenance template with Discord timestamps and countdowns", () => {
    const result = renderTemplate("maintenance", {
      title: "Database Migration",
      start: "2024-03-15T02:00:00Z",
      end: "2024-03-15T04:00:00Z",
      services: "API, Dashboard",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("Database Migration");
    expect(embed.color).toBe(0xfee75c);
    expect(embed.author?.name).toBe("Infrastructure");
    expect(embed.footer?.icon_url).toBeDefined();
    // Discord timestamps
    const startField = embed.fields?.find((f) => f.name.includes("Start"));
    expect(startField).toBeDefined();
    expect(startField!.value).toContain("<t:");
    const endField = embed.fields?.find((f) => f.name.includes("End"));
    expect(endField).toBeDefined();
    expect(endField!.value).toContain("<t:");
  });

  it("renders status_update operational", () => {
    const result = renderTemplate("status_update", {
      status: "operational",
      uptime: "99.99%",
      url: "https://status.example.com",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("🟢");
    expect(embed.color).toBe(0x57f287);
    expect(embed.author?.name).toBe("Status Monitor");
    expect(result.components).toBeDefined();
  });

  it("renders status_update outage", () => {
    const result = renderTemplate("status_update", {
      status: "outage",
      message: "API is down",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("🔴");
    expect(embed.color).toBe(0xed4245);
  });

  it("renders review template with clickable title and PR button", () => {
    const result = renderTemplate("review", {
      title: "Add template system",
      repo: "discord-ops",
      author: "alice",
      branch: "feat/templates",
      url: "https://github.com/bookedsolidtech/discord-ops/pull/6",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("Add template system");
    expect(embed.url).toBe("https://github.com/bookedsolidtech/discord-ops/pull/6");
    expect(embed.author?.name).toBe("Code Review");
    expect(result.components).toBeDefined();
    expect(result.components![0].buttons[0].label).toBe("Open Pull Request");
  });

  it("renders review with diff stats", () => {
    const result = renderTemplate("review", {
      title: "Big refactor",
      additions: "450",
      deletions: "200",
      files_changed: "12",
    });
    const embed = result.embeds[0];
    expect(embed.fields?.some((f) => f.value === "`+450`")).toBe(true);
    expect(embed.fields?.some((f) => f.value === "`-200`")).toBe(true);
  });
});

describe("template rendering — team", () => {
  it("renders celebration template with author", () => {
    const result = renderTemplate("celebration", {
      title: "10K Users!",
      message: "We just hit 10,000 users!",
      achievement: "10,000 registered users",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("10K Users");
    expect(embed.color).toBe(0xf47fff);
    expect(embed.author?.name).toContain("Celebrations");
  });

  it("renders welcome template with onboarding buttons", () => {
    const result = renderTemplate("welcome", {
      name: "Alice",
      role: "Engineer",
      team: "Platform",
      mention: "<@123456>",
      handbook_url: "https://example.com/handbook",
      onboarding_url: "https://example.com/onboard",
    });

    expect(result.content).toBe("<@123456>");
    const embed = result.embeds[0];
    expect(embed.title).toContain("Alice");
    expect(embed.fields?.some((f) => f.value === "Engineer")).toBe(true);
    expect(result.components).toBeDefined();
    expect(result.components![0].buttons.some((b) => b.label === "Handbook")).toBe(true);
    expect(result.components![0].buttons.some((b) => b.label === "Onboarding")).toBe(true);
  });

  it("renders welcome with Discord timestamp start_date", () => {
    const result = renderTemplate("welcome", {
      name: "Bob",
      start_date: "2024-04-01T00:00:00Z",
    });
    const embed = result.embeds[0];
    const dateField = embed.fields?.find((f) => f.name === "Start Date");
    expect(dateField).toBeDefined();
    expect(dateField!.value).toContain("<t:");
  });

  it("renders shoutout template with avatar", () => {
    const result = renderTemplate("shoutout", {
      name: "Bob",
      achievement: "Fixed the critical production bug in 10 minutes",
      avatar: "https://example.com/bob.png",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("Bob");
    expect(embed.color).toBe(0xf0b132);
    expect(embed.thumbnail?.url).toBe("https://example.com/bob.png");
  });

  it("renders quote template with block-quote", () => {
    const result = renderTemplate("quote", {
      text: "Move fast and break things",
      author: "Mark Zuckerberg",
    });

    const embed = result.embeds[0];
    expect(embed.description).toContain(">>>");
    expect(embed.description).toContain("Move fast");
    expect(embed.footer?.text).toContain("Mark Zuckerberg");
    expect(embed.color).toBe(0x9b59b6);
  });

  it("renders announcement template with Discord timestamp deadline", () => {
    const result = renderTemplate("announcement", {
      title: "API Key Rotation",
      message: "All API keys will be rotated next Monday.",
      action: "Update your .env files before March 20",
      deadline: "2024-03-20T00:00:00Z",
      link: "https://example.com/docs/rotation",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("API Key Rotation");
    expect(embed.url).toBe("https://example.com/docs/rotation");
    expect(embed.fields?.some((f) => f.name.includes("Action"))).toBe(true);
    // Deadline with Discord timestamp
    const deadlineField = embed.fields?.find((f) => f.name.includes("Deadline"));
    expect(deadlineField).toBeDefined();
    expect(deadlineField!.value).toContain("<t:");
    // Link button
    expect(result.components).toBeDefined();
  });

  it("renders changelog template with author and link button", () => {
    const result = renderTemplate("changelog", {
      version: "0.5.0",
      added: "- Config validation\n- list_projects tool",
      fixed: "- Version string mismatch",
      link: "https://github.com/example/CHANGELOG.md",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("0.5.0");
    expect(embed.author?.name).toBe("Changelog");
    expect(embed.fields?.some((f) => f.name.includes("Added"))).toBe(true);
    expect(embed.fields?.some((f) => f.name.includes("Fixed"))).toBe(true);
    expect(result.components).toBeDefined();
  });

  it("renders changelog with deprecated and performance fields", () => {
    const result = renderTemplate("changelog", {
      deprecated: "- Old auth middleware",
      performance: "- 2x faster startup",
    });
    const embed = result.embeds[0];
    expect(embed.fields?.some((f) => f.name.includes("Deprecated"))).toBe(true);
    expect(embed.fields?.some((f) => f.name.includes("Performance"))).toBe(true);
  });

  it("renders milestone template with deadline countdown", () => {
    const result = renderTemplate("milestone", {
      title: "v1.0 Released",
      metric: "42 tools shipped",
      target: "50 tools by Q2",
      next: "Template system + custom embeds",
      deadline: "2024-06-30T00:00:00Z",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("v1.0 Released");
    expect(embed.color).toBe(0xf0b132);
    const deadlineField = embed.fields?.find((f) => f.name.includes("Target Date"));
    expect(deadlineField).toBeDefined();
    expect(deadlineField!.value).toContain("<t:");
  });

  it("renders tip template with syntax highlighting", () => {
    const result = renderTemplate("tip", {
      title: "TypeScript Tip",
      message: "Use `satisfies` for type-safe object literals",
      example: "const config = { port: 3000 } satisfies Config;",
      language: "typescript",
      link: "https://www.typescriptlang.org/docs",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("TypeScript Tip");
    expect(embed.author?.name).toBe("Tips & Tricks");
    expect(embed.fields?.some((f) => f.value.includes("```typescript"))).toBe(true);
    expect(result.components).toBeDefined();
  });

  it("renders poll template as native Discord poll", () => {
    const result = renderTemplate("poll", {
      question: "Best language?",
      options: "TypeScript|Rust|Go|Python",
      duration: "48",
    });

    // Native poll — no embeds
    expect(result.embeds).toHaveLength(0);
    expect(result.poll).toBeDefined();
    expect(result.poll!.question).toBe("Best language?");
    expect(result.poll!.answers).toHaveLength(4);
    expect(result.poll!.answers[0].text).toBe("TypeScript");
    expect(result.poll!.answers[1].text).toBe("Rust");
    expect(result.poll!.duration).toBe(48);
  });

  it("renders poll with multiselect", () => {
    const result = renderTemplate("poll", {
      question: "Favorite foods?",
      options: "Pizza|Sushi|Tacos",
      multiselect: "true",
    });
    expect(result.poll!.allow_multiselect).toBe(true);
  });

  it("renders poll fallback embed when no options", () => {
    const result = renderTemplate("poll", {
      question: "Thoughts on the new design?",
    });
    expect(result.embeds).toHaveLength(1);
    expect(result.poll).toBeUndefined();
  });
});

describe("template rendering — new templates", () => {
  it("renders dashboard with multi-embed", () => {
    const result = renderTemplate("dashboard", {
      services: "API|Database|CDN|Auth",
      statuses: "operational|operational|degraded|outage",
      title: "Production Status",
      url: "https://status.example.com",
    });

    // Header + 4 service embeds
    expect(result.embeds).toHaveLength(5);
    expect(result.embeds[0].title).toContain("Production Status");
    expect(result.embeds[0].author?.name).toBe("Service Dashboard");
    expect(result.embeds[1].title).toContain("🟢");
    expect(result.embeds[1].title).toContain("API");
    expect(result.embeds[3].title).toContain("🟡");
    expect(result.embeds[3].title).toContain("CDN");
    expect(result.embeds[4].title).toContain("🔴");
    expect(result.embeds[4].title).toContain("Auth");
    expect(result.components).toBeDefined();
  });

  it("dashboard limits to 9 services + 1 header", () => {
    const services = Array.from({ length: 12 }, (_, i) => `svc${i}`).join("|");
    const statuses = Array.from({ length: 12 }, () => "operational").join("|");
    const result = renderTemplate("dashboard", { services, statuses });
    expect(result.embeds.length).toBeLessThanOrEqual(10);
  });

  it("renders progress bar template", () => {
    const result = renderTemplate("progress", {
      percent: "75",
      title: "Sprint Progress",
      completed: "15 tasks",
      remaining: "5 tasks",
      deadline: "2024-04-01T00:00:00Z",
    });

    const embed = result.embeds[0];
    expect(embed.title).toBe("Sprint Progress");
    // 75% = 15 filled blocks
    expect(embed.description).toContain("█".repeat(15));
    expect(embed.description).toContain("░".repeat(5));
    expect(embed.description).toContain("75%");
    expect(embed.color).toBe(0x1abc9c); // mint for >= 50%
  });

  it("renders progress at 100% with success color", () => {
    const result = renderTemplate("progress", { percent: "100" });
    expect(result.embeds[0].color).toBe(0x57f287);
    expect(result.embeds[0].description).toContain("100%");
  });

  it("renders oncall handoff template", () => {
    const result = renderTemplate("oncall", {
      outgoing: "Alice",
      incoming: "Bob",
      shift_start: "2024-03-15T18:00:00Z",
      notes: "Watch the payment service — intermittent timeouts",
      runbook_url: "https://wiki.example.com/oncall",
    });

    const embed = result.embeds[0];
    expect(embed.title).toBe("🔔 On-Call Handoff");
    expect(embed.author?.name).toBe("On-Call");
    expect(embed.fields?.some((f) => f.value === "Alice")).toBe(true);
    expect(embed.fields?.some((f) => f.value === "Bob")).toBe(true);
    const shiftField = embed.fields?.find((f) => f.name.includes("Shift Start"));
    expect(shiftField!.value).toContain("<t:");
    expect(result.components).toBeDefined();
    expect(result.components![0].buttons[0].label).toBe("Runbook");
  });

  it("renders standup template", () => {
    const result = renderTemplate("standup", {
      name: "Alice",
      yesterday: "- Finished template system\n- Code review for PR #6",
      today: "- Release v0.7.0\n- Start on components",
      blockers: "None!",
      mood: "🟢",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("Alice");
    expect(embed.title).toContain("Standup");
    expect(embed.author?.name).toBe("Alice");
    expect(embed.fields?.some((f) => f.name.includes("Yesterday"))).toBe(true);
    expect(embed.fields?.some((f) => f.name.includes("Today"))).toBe(true);
    expect(embed.fields?.some((f) => f.name.includes("Blockers"))).toBe(true);
  });

  it("renders retro template", () => {
    const result = renderTemplate("retro", {
      title: "Sprint 42 Retro",
      went_well: "- Shipped on time\n- Good test coverage",
      improve: "- Deployment process needs automation",
      action_items: "- Set up CI/CD pipeline",
      sprint: "Sprint 42",
      velocity: "34 points",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("Sprint 42 Retro");
    expect(embed.color).toBe(0x9b59b6);
    expect(embed.fields?.some((f) => f.name.includes("What Went Well"))).toBe(true);
    expect(embed.fields?.some((f) => f.name.includes("Action Items"))).toBe(true);
  });

  it("renders alert template with level-based colors", () => {
    const levels: Record<string, number> = {
      info: 0x5865f2,
      warning: 0xfee75c,
      error: 0xed4245,
      critical: 0xe74c3c,
    };

    for (const [level, expectedColor] of Object.entries(levels)) {
      const result = renderTemplate("alert", {
        title: `${level} alert`,
        level,
        message: "Test alert",
      });
      expect(result.embeds[0].color).toBe(expectedColor);
    }
  });

  it("renders alert with metric threshold", () => {
    const result = renderTemplate("alert", {
      title: "High CPU Usage",
      level: "warning",
      source: "monitoring",
      metric: "cpu_usage",
      threshold: "80%",
      current_value: "92%",
      url: "https://grafana.example.com/d/cpu",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("High CPU Usage");
    expect(embed.fields?.some((f) => f.value === "`monitoring`")).toBe(true);
    expect(embed.fields?.some((f) => f.value === "92%")).toBe(true);
    expect(result.components).toBeDefined();
  });
});

describe("template timestamp helpers", () => {
  it("converts ISO dates to Discord timestamps in maintenance", () => {
    const result = renderTemplate("maintenance", {
      title: "Test",
      start: "2024-06-15T10:00:00Z",
    });
    const startField = result.embeds[0].fields?.find((f) => f.name.includes("Start"));
    // Should contain both full timestamp and relative countdown
    expect(startField!.value).toMatch(/<t:\d+:F>/);
    expect(startField!.value).toMatch(/<t:\d+:R>/);
  });

  it("preserves unparseable date strings", () => {
    const result = renderTemplate("maintenance", {
      title: "Test",
      start: "TBD",
    });
    const startField = result.embeds[0].fields?.find((f) => f.name.includes("Start"));
    expect(startField!.value).toContain("TBD");
  });
});

describe("simple template", () => {
  it("renders a minimal embed with message", () => {
    const result = renderTemplate("simple", { message: "Hello world" });
    expect(result.embeds).toHaveLength(1);
    expect(result.embeds[0].description).toBe("Hello world");
    expect(result.embeds[0].color).toBeDefined();
    expect(result.embeds[0].timestamp).toBeDefined();
  });

  it("includes optional title", () => {
    const result = renderTemplate("simple", { message: "Body", title: "My Title" });
    expect(result.embeds[0].title).toBe("My Title");
  });

  it("includes author when provided", () => {
    const result = renderTemplate("simple", {
      message: "Body",
      author_name: "Bot Name",
      author_icon: "https://example.com/icon.png",
    });
    expect(result.embeds[0].author).toEqual({
      name: "Bot Name",
      icon_url: "https://example.com/icon.png",
    });
  });

  it("omits author when not provided", () => {
    const result = renderTemplate("simple", { message: "Body" });
    expect(result.embeds[0].author).toBeUndefined();
  });

  it("uses custom color", () => {
    const result = renderTemplate("simple", { message: "Body", color: "success" });
    expect(result.embeds[0].color).toBe(0x57f287); // Colors.success
  });

  it("includes footer when provided", () => {
    const result = renderTemplate("simple", { message: "Body", footer: "My Footer" });
    expect(result.embeds[0].footer).toEqual({ text: "My Footer" });
  });

  it("requires message var", () => {
    expect(() => renderTemplate("simple", {})).toThrow("requires: message");
  });
});
