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
    expect(all.length).toBeGreaterThanOrEqual(17);
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
});

describe("template rendering", () => {
  it("renders release template", () => {
    const result = renderTemplate("release", {
      version: "1.0.0",
      name: "My App",
      notes: "First stable release!",
      npm: "my-app@1.0.0",
    });

    expect(result.embeds).toHaveLength(1);
    const embed = result.embeds[0];
    expect(embed.title).toContain("1.0.0");
    expect(embed.title).toContain("My App");
    expect(embed.description).toContain("First stable");
    expect(embed.color).toBe(0x57f287); // success green
    expect(embed.fields?.some((f) => f.value.includes("npm install"))).toBe(true);
  });

  it("renders deploy success template", () => {
    const result = renderTemplate("deploy", {
      status: "success",
      environment: "production",
      version: "2.0.0",
      duration: "45s",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("✅");
    expect(embed.title).toContain("Succeeded");
    expect(embed.color).toBe(0x57f287);
    expect(embed.fields?.some((f) => f.value === "production")).toBe(true);
  });

  it("renders deploy failure template", () => {
    const result = renderTemplate("deploy", { status: "failed" });
    const embed = result.embeds[0];
    expect(embed.title).toContain("❌");
    expect(embed.color).toBe(0xed4245); // error red
  });

  it("renders ci_build passed template", () => {
    const result = renderTemplate("ci_build", {
      status: "passed",
      branch: "main",
      tests: "210 passed",
      coverage: "87%",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("🟢");
    expect(embed.title).toContain("main");
    expect(embed.fields?.some((f) => f.value === "210 passed")).toBe(true);
    expect(embed.fields?.some((f) => f.value === "87%")).toBe(true);
  });

  it("renders incident template", () => {
    const result = renderTemplate("incident", {
      title: "API Outage",
      severity: "critical",
      status: "investigating",
      service: "api-gateway",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("API Outage");
    expect(embed.color).toBe(0xed4245);
    expect(embed.fields?.some((f) => f.value === "critical")).toBe(true);
  });

  it("renders incident_resolved template", () => {
    const result = renderTemplate("incident_resolved", {
      title: "API Outage",
      duration: "23 minutes",
      root_cause: "Database connection pool exhaustion",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("Resolved");
    expect(embed.color).toBe(0x57f287);
    expect(embed.fields?.some((f) => f.value.includes("connection pool"))).toBe(true);
  });

  it("renders celebration template", () => {
    const result = renderTemplate("celebration", {
      title: "10K Users!",
      message: "We just hit 10,000 users!",
      achievement: "10,000 registered users",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("10K Users");
    expect(embed.color).toBe(0xf47fff); // celebration pink
  });

  it("renders welcome template with mention", () => {
    const result = renderTemplate("welcome", {
      name: "Alice",
      role: "Engineer",
      team: "Platform",
      mention: "<@123456>",
    });

    expect(result.content).toBe("<@123456>");
    const embed = result.embeds[0];
    expect(embed.title).toContain("Alice");
    expect(embed.fields?.some((f) => f.value === "Engineer")).toBe(true);
  });

  it("renders quote template", () => {
    const result = renderTemplate("quote", {
      text: "Move fast and break things",
      author: "Mark Zuckerberg",
    });

    const embed = result.embeds[0];
    expect(embed.description).toContain("Move fast");
    expect(embed.footer?.text).toContain("Mark Zuckerberg");
    expect(embed.color).toBe(0x9b59b6); // lavender
  });

  it("renders changelog template", () => {
    const result = renderTemplate("changelog", {
      version: "0.5.0",
      added: "- Config validation\n- list_projects tool",
      fixed: "- Version string mismatch",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("0.5.0");
    expect(embed.fields?.some((f) => f.name.includes("Added"))).toBe(true);
    expect(embed.fields?.some((f) => f.name.includes("Fixed"))).toBe(true);
  });

  it("renders poll template with options", () => {
    const result = renderTemplate("poll", {
      question: "Best language?",
      options: "TypeScript|Rust|Go|Python",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("Best language");
    expect(embed.description).toContain("1️⃣ TypeScript");
    expect(embed.description).toContain("2️⃣ Rust");
    expect(embed.description).toContain("3️⃣ Go");
    expect(embed.description).toContain("4️⃣ Python");
  });

  it("renders status_update template with operational status", () => {
    const result = renderTemplate("status_update", {
      status: "operational",
      uptime: "99.99%",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("🟢");
    expect(embed.color).toBe(0x57f287);
  });

  it("renders status_update template with outage status", () => {
    const result = renderTemplate("status_update", {
      status: "outage",
      message: "API is down",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("🔴");
    expect(embed.color).toBe(0xed4245);
  });

  it("renders maintenance template", () => {
    const result = renderTemplate("maintenance", {
      title: "Database Migration",
      start: "2024-03-15 02:00 UTC",
      end: "2024-03-15 04:00 UTC",
      services: "API, Dashboard",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("Database Migration");
    expect(embed.color).toBe(0xfee75c); // warning yellow
  });

  it("renders shoutout template", () => {
    const result = renderTemplate("shoutout", {
      name: "Bob",
      achievement: "Fixed the critical production bug in 10 minutes",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("Bob");
    expect(embed.color).toBe(0xf0b132); // gold
  });

  it("renders tip template with code example", () => {
    const result = renderTemplate("tip", {
      title: "TypeScript Tip",
      message: "Use `satisfies` for type-safe object literals",
      example: "const config = { port: 3000 } satisfies Config;",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("TypeScript Tip");
    expect(embed.fields?.some((f) => f.value.includes("satisfies"))).toBe(true);
  });

  it("renders review template", () => {
    const result = renderTemplate("review", {
      title: "Add template system",
      repo: "discord-ops",
      author: "alice",
      branch: "feat/templates",
      url: "https://github.com/bookedsolidtech/discord-ops/pull/6",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("Add template system");
    expect(embed.fields?.some((f) => f.value === "discord-ops")).toBe(true);
  });

  it("renders announcement template with action required", () => {
    const result = renderTemplate("announcement", {
      title: "API Key Rotation",
      message: "All API keys will be rotated next Monday.",
      action: "Update your .env files before March 20",
      deadline: "March 20, 2024",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("API Key Rotation");
    expect(embed.fields?.some((f) => f.name.includes("Action"))).toBe(true);
    expect(embed.fields?.some((f) => f.name.includes("Deadline"))).toBe(true);
  });

  it("renders milestone template", () => {
    const result = renderTemplate("milestone", {
      title: "v1.0 Released",
      metric: "42 tools shipped",
      target: "50 tools by Q2",
      next: "Template system + custom embeds",
    });

    const embed = result.embeds[0];
    expect(embed.title).toContain("v1.0 Released");
    expect(embed.color).toBe(0xf0b132); // gold
  });
});
