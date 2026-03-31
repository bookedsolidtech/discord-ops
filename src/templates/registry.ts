import type { TemplateRenderer, RenderedTemplate } from "./types.js";
import { Colors } from "./types.js";

/**
 * All built-in templates.
 * Each template is a function that takes string key-value vars and returns embeds.
 *
 * Required vars are documented in the description — the tool exposes these
 * so the AI knows what to pass.
 */

// ─── DevOps ──────────────────────────────────────────────────────────

const release: TemplateRenderer = (vars) => ({
  embeds: [
    {
      title: `🚀 ${vars.name ?? "Release"} ${vars.version}`,
      description: vars.notes ?? "A new version has been released.",
      color: Colors.success,
      fields: [
        ...(vars.highlights ? [{ name: "Highlights", value: vars.highlights }] : []),
        ...(vars.breaking ? [{ name: "⚠️ Breaking Changes", value: vars.breaking }] : []),
        ...(vars.link
          ? [{ name: "Links", value: `[Release Notes](${vars.link})`, inline: true }]
          : []),
        ...(vars.npm
          ? [{ name: "Install", value: `\`npm install ${vars.npm}\``, inline: true }]
          : []),
      ],
      footer: { text: vars.footer ?? "Release Pipeline" },
      timestamp: new Date().toISOString(),
    },
  ],
});

const deploy: TemplateRenderer = (vars) => {
  const success = (vars.status ?? "success") === "success";
  return {
    embeds: [
      {
        title: `${success ? "✅" : "❌"} Deploy ${success ? "Succeeded" : "Failed"}`,
        description:
          vars.message ??
          `Deployment to **${vars.environment ?? "production"}** ${success ? "completed" : "failed"}.`,
        color: success ? Colors.success : Colors.error,
        fields: [
          { name: "Environment", value: vars.environment ?? "production", inline: true },
          ...(vars.version ? [{ name: "Version", value: vars.version, inline: true }] : []),
          ...(vars.duration ? [{ name: "Duration", value: vars.duration, inline: true }] : []),
          ...(vars.commit
            ? [{ name: "Commit", value: `\`${vars.commit.slice(0, 8)}\``, inline: true }]
            : []),
          ...(vars.url ? [{ name: "URL", value: `[View Deployment](${vars.url})` }] : []),
        ],
        footer: { text: vars.footer ?? "Deployment Pipeline" },
        timestamp: new Date().toISOString(),
      },
    ],
  };
};

const ciBuild: TemplateRenderer = (vars) => {
  const passed = (vars.status ?? "passed") === "passed";
  return {
    embeds: [
      {
        title: `${passed ? "🟢" : "🔴"} Build ${passed ? "Passed" : "Failed"} — ${vars.branch ?? "main"}`,
        description: vars.message ?? undefined,
        color: passed ? Colors.success : Colors.error,
        fields: [
          ...(vars.repo ? [{ name: "Repository", value: vars.repo, inline: true }] : []),
          ...(vars.branch ? [{ name: "Branch", value: `\`${vars.branch}\``, inline: true }] : []),
          ...(vars.duration ? [{ name: "Duration", value: vars.duration, inline: true }] : []),
          ...(vars.tests ? [{ name: "Tests", value: vars.tests, inline: true }] : []),
          ...(vars.coverage ? [{ name: "Coverage", value: vars.coverage, inline: true }] : []),
          ...(vars.commit
            ? [{ name: "Commit", value: `\`${vars.commit.slice(0, 8)}\``, inline: true }]
            : []),
          ...(vars.url ? [{ name: "Details", value: `[View Build](${vars.url})` }] : []),
        ],
        footer: { text: vars.footer ?? "CI Pipeline" },
        timestamp: new Date().toISOString(),
      },
    ],
  };
};

const incident: TemplateRenderer = (vars) => ({
  embeds: [
    {
      title: `🚨 Incident: ${vars.title ?? "Service Disruption"}`,
      description: vars.description ?? "An incident has been detected.",
      color: Colors.error,
      fields: [
        { name: "Severity", value: vars.severity ?? "high", inline: true },
        { name: "Status", value: vars.status ?? "investigating", inline: true },
        ...(vars.service ? [{ name: "Service", value: vars.service, inline: true }] : []),
        ...(vars.impact ? [{ name: "Impact", value: vars.impact }] : []),
        ...(vars.url ? [{ name: "Status Page", value: `[View Status](${vars.url})` }] : []),
      ],
      footer: { text: vars.footer ?? "Incident Management" },
      timestamp: new Date().toISOString(),
    },
  ],
});

const incidentResolved: TemplateRenderer = (vars) => ({
  embeds: [
    {
      title: `✅ Resolved: ${vars.title ?? "Incident"}`,
      description: vars.description ?? "The incident has been resolved.",
      color: Colors.success,
      fields: [
        ...(vars.duration ? [{ name: "Duration", value: vars.duration, inline: true }] : []),
        ...(vars.root_cause ? [{ name: "Root Cause", value: vars.root_cause }] : []),
        ...(vars.resolution ? [{ name: "Resolution", value: vars.resolution }] : []),
        ...(vars.url ? [{ name: "Postmortem", value: `[View Details](${vars.url})` }] : []),
      ],
      footer: { text: vars.footer ?? "Incident Management" },
      timestamp: new Date().toISOString(),
    },
  ],
});

const maintenance: TemplateRenderer = (vars) => ({
  embeds: [
    {
      title: `🔧 Scheduled Maintenance: ${vars.title ?? "System Update"}`,
      description: vars.description ?? "Scheduled maintenance window.",
      color: Colors.warning,
      fields: [
        ...(vars.start ? [{ name: "Start", value: vars.start, inline: true }] : []),
        ...(vars.end ? [{ name: "End", value: vars.end, inline: true }] : []),
        ...(vars.services ? [{ name: "Affected Services", value: vars.services }] : []),
        ...(vars.impact ? [{ name: "Expected Impact", value: vars.impact }] : []),
      ],
      footer: { text: vars.footer ?? "Infrastructure" },
      timestamp: new Date().toISOString(),
    },
  ],
});

// ─── Team & Community ────────────────────────────────────────────────

const celebration: TemplateRenderer = (vars) => ({
  content: vars.mention ?? undefined,
  embeds: [
    {
      title: `🎉 ${vars.title ?? "Celebration!"}`,
      description: vars.message ?? "Something amazing just happened!",
      color: Colors.celebration,
      ...(vars.image ? { image: { url: vars.image } } : {}),
      fields: [
        ...(vars.achievement ? [{ name: "🏆 Achievement", value: vars.achievement }] : []),
        ...(vars.details ? [{ name: "Details", value: vars.details }] : []),
      ],
      footer: { text: vars.footer ?? "🥂 Cheers!" },
      timestamp: new Date().toISOString(),
    },
  ],
});

const welcome: TemplateRenderer = (vars) => ({
  content: vars.mention ?? undefined,
  embeds: [
    {
      title: `👋 Welcome${vars.name ? `, ${vars.name}` : ""}!`,
      description: vars.message ?? "We're excited to have you here!",
      color: Colors.ocean,
      ...(vars.avatar ? { thumbnail: { url: vars.avatar } } : {}),
      fields: [
        ...(vars.role ? [{ name: "Role", value: vars.role, inline: true }] : []),
        ...(vars.team ? [{ name: "Team", value: vars.team, inline: true }] : []),
        ...(vars.intro ? [{ name: "About", value: vars.intro }] : []),
        ...(vars.resources ? [{ name: "📚 Getting Started", value: vars.resources }] : []),
      ],
      footer: { text: vars.footer ?? "Welcome aboard!" },
      timestamp: new Date().toISOString(),
    },
  ],
});

const shoutout: TemplateRenderer = (vars) => ({
  content: vars.mention ?? undefined,
  embeds: [
    {
      title: `⭐ Shoutout${vars.name ? ` to ${vars.name}` : ""}!`,
      description: vars.message ?? "Outstanding work!",
      color: Colors.premium,
      fields: [
        ...(vars.achievement ? [{ name: "🏅 For", value: vars.achievement }] : []),
        ...(vars.impact ? [{ name: "Impact", value: vars.impact }] : []),
      ],
      footer: { text: vars.footer ?? "Recognition" },
      timestamp: new Date().toISOString(),
    },
  ],
});

const quote: TemplateRenderer = (vars) => ({
  embeds: [
    {
      description: `> *${vars.text ?? "The best way to predict the future is to invent it."}*`,
      color: Colors.lavender,
      footer: {
        text: vars.author
          ? `— ${vars.author}${vars.source ? `, ${vars.source}` : ""}`
          : (vars.footer ?? "💭"),
      },
    },
  ],
});

const announcement: TemplateRenderer = (vars) => ({
  content: vars.mention ?? undefined,
  embeds: [
    {
      title: `📢 ${vars.title ?? "Announcement"}`,
      description: vars.message ?? "",
      color: Colors.info,
      ...(vars.image ? { image: { url: vars.image } } : {}),
      fields: [
        ...(vars.details ? [{ name: "Details", value: vars.details }] : []),
        ...(vars.action ? [{ name: "⚡ Action Required", value: vars.action }] : []),
        ...(vars.deadline ? [{ name: "📅 Deadline", value: vars.deadline, inline: true }] : []),
        ...(vars.link
          ? [{ name: "🔗 Link", value: `[Learn More](${vars.link})`, inline: true }]
          : []),
      ],
      footer: { text: vars.footer ?? "Announcement" },
      timestamp: new Date().toISOString(),
    },
  ],
});

const changelog: TemplateRenderer = (vars) => ({
  embeds: [
    {
      title: `📋 ${vars.title ?? "What's New"} ${vars.version ?? ""}`.trim(),
      description: vars.summary ?? "",
      color: Colors.mint,
      fields: [
        ...(vars.added ? [{ name: "✨ Added", value: vars.added }] : []),
        ...(vars.changed ? [{ name: "🔄 Changed", value: vars.changed }] : []),
        ...(vars.fixed ? [{ name: "🐛 Fixed", value: vars.fixed }] : []),
        ...(vars.removed ? [{ name: "🗑️ Removed", value: vars.removed }] : []),
        ...(vars.security ? [{ name: "🔒 Security", value: vars.security }] : []),
        ...(vars.link ? [{ name: "Full Changelog", value: `[View on GitHub](${vars.link})` }] : []),
      ],
      footer: { text: vars.footer ?? "Changelog" },
      timestamp: new Date().toISOString(),
    },
  ],
});

const milestone: TemplateRenderer = (vars) => ({
  content: vars.mention ?? undefined,
  embeds: [
    {
      title: `🏁 Milestone: ${vars.title ?? "Reached!"}`,
      description: vars.message ?? "A major milestone has been achieved!",
      color: Colors.premium,
      fields: [
        ...(vars.metric ? [{ name: "📊 Metric", value: vars.metric, inline: true }] : []),
        ...(vars.target ? [{ name: "🎯 Target", value: vars.target, inline: true }] : []),
        ...(vars.next ? [{ name: "⏭️ Next Goal", value: vars.next }] : []),
        ...(vars.contributors ? [{ name: "👥 Contributors", value: vars.contributors }] : []),
      ],
      footer: { text: vars.footer ?? "Milestones" },
      timestamp: new Date().toISOString(),
    },
  ],
});

const statusUpdate: TemplateRenderer = (vars) => {
  const statusColors: Record<string, number> = {
    operational: Colors.success,
    degraded: Colors.warning,
    outage: Colors.error,
    maintenance: Colors.frost,
  };
  const statusIcons: Record<string, string> = {
    operational: "🟢",
    degraded: "🟡",
    outage: "🔴",
    maintenance: "🔵",
  };
  const status = vars.status ?? "operational";

  return {
    embeds: [
      {
        title: `${statusIcons[status] ?? "⚪"} Status: ${vars.title ?? status.charAt(0).toUpperCase() + status.slice(1)}`,
        description: vars.message ?? undefined,
        color: statusColors[status] ?? Colors.frost,
        fields: [
          ...(vars.services ? [{ name: "Services", value: vars.services }] : []),
          ...(vars.uptime ? [{ name: "Uptime", value: vars.uptime, inline: true }] : []),
          ...(vars.response_time
            ? [{ name: "Response Time", value: vars.response_time, inline: true }]
            : []),
          ...(vars.url ? [{ name: "Status Page", value: `[View Dashboard](${vars.url})` }] : []),
        ],
        footer: { text: vars.footer ?? "Status Monitor" },
        timestamp: new Date().toISOString(),
      },
    ],
  };
};

const tip: TemplateRenderer = (vars) => ({
  embeds: [
    {
      title: `💡 ${vars.title ?? "Pro Tip"}`,
      description: vars.message ?? "",
      color: Colors.sunset,
      fields: [
        ...(vars.example ? [{ name: "Example", value: `\`\`\`\n${vars.example}\n\`\`\`` }] : []),
        ...(vars.link ? [{ name: "📖 Learn More", value: `[Documentation](${vars.link})` }] : []),
      ],
      footer: { text: vars.footer ?? "Tips & Tricks" },
    },
  ],
});

const poll: TemplateRenderer = (vars) => {
  const options = (vars.options ?? "").split("|").filter(Boolean);
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

  return {
    embeds: [
      {
        title: `📊 ${vars.question ?? "Poll"}`,
        description:
          options.length > 0
            ? options.map((opt, i) => `${emojis[i] ?? `${i + 1}.`} ${opt.trim()}`).join("\n")
            : (vars.message ?? "React to vote!"),
        color: Colors.info,
        ...(vars.deadline ? { fields: [{ name: "⏰ Ends", value: vars.deadline }] } : {}),
        footer: { text: vars.footer ?? "React to vote!" },
      },
    ],
  };
};

const review: TemplateRenderer = (vars) => ({
  embeds: [
    {
      title: `🔍 PR Review: ${vars.title ?? "Pull Request"}`,
      description: vars.summary ?? undefined,
      color: Colors.info,
      fields: [
        ...(vars.repo ? [{ name: "Repository", value: vars.repo, inline: true }] : []),
        ...(vars.author ? [{ name: "Author", value: vars.author, inline: true }] : []),
        ...(vars.branch ? [{ name: "Branch", value: `\`${vars.branch}\``, inline: true }] : []),
        ...(vars.changes ? [{ name: "Changes", value: vars.changes }] : []),
        ...(vars.url ? [{ name: "Review", value: `[Open PR](${vars.url})` }] : []),
      ],
      footer: { text: vars.footer ?? "Code Review" },
      timestamp: new Date().toISOString(),
    },
  ],
});

// ─── Registry ────────────────────────────────────────────────────────

export interface TemplateInfo {
  name: string;
  category: string;
  description: string;
  requiredVars: string[];
  optionalVars: string[];
  render: TemplateRenderer;
}

export const templates: Record<string, TemplateInfo> = {
  // DevOps
  release: {
    name: "release",
    category: "devops",
    description:
      "Version release announcement with highlights, breaking changes, and install instructions",
    requiredVars: ["version"],
    optionalVars: ["name", "notes", "highlights", "breaking", "link", "npm", "footer"],
    render: release,
  },
  deploy: {
    name: "deploy",
    category: "devops",
    description: "Deployment notification with status, environment, duration, and commit info",
    requiredVars: [],
    optionalVars: [
      "status",
      "environment",
      "version",
      "duration",
      "commit",
      "url",
      "message",
      "footer",
    ],
    render: deploy,
  },
  ci_build: {
    name: "ci_build",
    category: "devops",
    description: "CI build result with branch, tests, coverage, and duration",
    requiredVars: [],
    optionalVars: [
      "status",
      "branch",
      "repo",
      "duration",
      "tests",
      "coverage",
      "commit",
      "url",
      "message",
      "footer",
    ],
    render: ciBuild,
  },
  incident: {
    name: "incident",
    category: "devops",
    description: "Incident alert with severity, status, service, and impact details",
    requiredVars: ["title"],
    optionalVars: ["description", "severity", "status", "service", "impact", "url", "footer"],
    render: incident,
  },
  incident_resolved: {
    name: "incident_resolved",
    category: "devops",
    description: "Incident resolution with root cause, duration, and postmortem link",
    requiredVars: ["title"],
    optionalVars: ["description", "duration", "root_cause", "resolution", "url", "footer"],
    render: incidentResolved,
  },
  maintenance: {
    name: "maintenance",
    category: "devops",
    description: "Scheduled maintenance notice with time window and affected services",
    requiredVars: ["title"],
    optionalVars: ["description", "start", "end", "services", "impact", "footer"],
    render: maintenance,
  },
  status_update: {
    name: "status_update",
    category: "devops",
    description:
      "Service status update (operational/degraded/outage/maintenance) with uptime and response time",
    requiredVars: ["status"],
    optionalVars: ["title", "message", "services", "uptime", "response_time", "url", "footer"],
    render: statusUpdate,
  },
  review: {
    name: "review",
    category: "devops",
    description: "Pull request review request with repo, author, branch, and change summary",
    requiredVars: ["title"],
    optionalVars: ["summary", "repo", "author", "branch", "changes", "url", "footer"],
    render: review,
  },

  // Team & Community
  celebration: {
    name: "celebration",
    category: "team",
    description: "Celebrate wins, milestones, and achievements with style",
    requiredVars: [],
    optionalVars: ["title", "message", "achievement", "details", "image", "mention", "footer"],
    render: celebration,
  },
  welcome: {
    name: "welcome",
    category: "team",
    description: "Welcome a new team member with role, team, and onboarding resources",
    requiredVars: [],
    optionalVars: [
      "name",
      "message",
      "role",
      "team",
      "intro",
      "resources",
      "avatar",
      "mention",
      "footer",
    ],
    render: welcome,
  },
  shoutout: {
    name: "shoutout",
    category: "team",
    description: "Recognize someone's outstanding work with a gold-themed shoutout",
    requiredVars: [],
    optionalVars: ["name", "message", "achievement", "impact", "mention", "footer"],
    render: shoutout,
  },
  quote: {
    name: "quote",
    category: "team",
    description: "Share an inspirational or motivational quote with attribution",
    requiredVars: ["text"],
    optionalVars: ["author", "source", "footer"],
    render: quote,
  },
  announcement: {
    name: "announcement",
    category: "team",
    description: "General announcement with action items, deadlines, and links",
    requiredVars: ["title"],
    optionalVars: [
      "message",
      "details",
      "action",
      "deadline",
      "link",
      "image",
      "mention",
      "footer",
    ],
    render: announcement,
  },
  changelog: {
    name: "changelog",
    category: "team",
    description: "What's new — added, changed, fixed, removed, security updates",
    requiredVars: [],
    optionalVars: [
      "title",
      "version",
      "summary",
      "added",
      "changed",
      "fixed",
      "removed",
      "security",
      "link",
      "footer",
    ],
    render: changelog,
  },
  milestone: {
    name: "milestone",
    category: "team",
    description: "Project milestone with metrics, targets, and next goals",
    requiredVars: ["title"],
    optionalVars: ["message", "metric", "target", "next", "contributors", "mention", "footer"],
    render: milestone,
  },
  tip: {
    name: "tip",
    category: "team",
    description: "Share a pro tip with optional code example and documentation link",
    requiredVars: ["message"],
    optionalVars: ["title", "example", "link", "footer"],
    render: tip,
  },
  poll: {
    name: "poll",
    category: "team",
    description: "Quick poll with numbered options (pipe-separated) and deadline",
    requiredVars: ["question"],
    optionalVars: ["options", "message", "deadline", "footer"],
    render: poll,
  },
};

export function getTemplate(name: string): TemplateInfo | undefined {
  return templates[name];
}

export function listTemplates(): TemplateInfo[] {
  return Object.values(templates);
}

export function renderTemplate(name: string, vars: Record<string, string>): RenderedTemplate {
  const template = templates[name];
  if (!template) {
    throw new Error(`Unknown template "${name}". Available: ${Object.keys(templates).join(", ")}`);
  }

  // Validate required vars
  const missing = template.requiredVars.filter((v) => !vars[v]);
  if (missing.length > 0) {
    throw new Error(`Template "${name}" requires: ${missing.join(", ")}`);
  }

  return template.render(vars);
}
