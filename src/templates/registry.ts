import type {
  TemplateRenderer,
  RenderedTemplate,
  TemplateActionRow,
  TemplatePoll,
} from "./types.js";
import { Colors, toDiscordTimestamp, discordCountdown } from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────

const STATUS_ICONS: Record<string, string> = {
  success: "https://cdn.discordapp.com/emojis/1138208556413583400.webp",
  error: "https://cdn.discordapp.com/emojis/1138208558888218775.webp",
  warning: "https://cdn.discordapp.com/emojis/1138208561681641472.webp",
  info: "https://cdn.discordapp.com/emojis/1138208553867575316.webp",
};

function linkButton(label: string, url: string, emoji?: string): TemplateActionRow {
  return {
    buttons: [{ style: "link" as const, label, url, ...(emoji ? { emoji } : {}) }],
  };
}

function multiLinkButtons(
  ...items: Array<{ label: string; url: string; emoji?: string }>
): TemplateActionRow {
  return {
    buttons: items.map(({ label, url, emoji }) => ({
      style: "link" as const,
      label,
      url,
      ...(emoji ? { emoji } : {}),
    })),
  };
}

// ─── DevOps ──────────────────────────────────────────────────────────

const release: TemplateRenderer = (vars) => ({
  embeds: [
    {
      author: {
        name: vars.author_name ?? "Release Pipeline",
        ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
      },
      title: `🚀 ${vars.name ?? "Release"} ${vars.version}`,
      description: vars.notes ?? "A new version has been released.",
      color: Colors.success,
      ...(vars.link ? { url: vars.link } : {}),
      fields: [
        ...(vars.highlights ? [{ name: "✨ Highlights", value: vars.highlights }] : []),
        ...(vars.breaking ? [{ name: "⚠️ Breaking Changes", value: vars.breaking }] : []),
        ...(vars.npm
          ? [{ name: "📦 Install", value: `\`\`\`\nnpm install ${vars.npm}\n\`\`\``, inline: true }]
          : []),
        ...(vars.migration ? [{ name: "📋 Migration", value: vars.migration }] : []),
      ],
      footer: {
        text: vars.footer ?? "Release Pipeline",
        icon_url: STATUS_ICONS.success,
      },
      timestamp: new Date().toISOString(),
    },
  ],
  ...(vars.link || vars.npm
    ? {
        components: [
          multiLinkButtons(
            ...(vars.link ? [{ label: "Release Notes", url: vars.link, emoji: "📋" }] : []),
            ...(vars.npm_url ? [{ label: "npm", url: vars.npm_url, emoji: "📦" }] : []),
            ...(vars.docs_url ? [{ label: "Documentation", url: vars.docs_url, emoji: "📖" }] : []),
          ),
        ],
      }
    : {}),
});

const deploy: TemplateRenderer = (vars) => {
  const success = (vars.status ?? "success") === "success";
  return {
    embeds: [
      {
        author: {
          name: vars.author_name ?? "Deployment Pipeline",
          ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
        },
        title: `${success ? "✅" : "❌"} Deploy ${success ? "Succeeded" : "Failed"}`,
        description:
          vars.message ??
          `Deployment to **${vars.environment ?? "production"}** ${success ? "completed successfully" : "failed"}.`,
        color: success ? Colors.success : Colors.error,
        ...(vars.url ? { url: vars.url } : {}),
        fields: [
          { name: "Environment", value: `\`${vars.environment ?? "production"}\``, inline: true },
          ...(vars.version
            ? [{ name: "Version", value: `\`${vars.version}\``, inline: true }]
            : []),
          ...(vars.duration ? [{ name: "Duration", value: vars.duration, inline: true }] : []),
          ...(vars.commit
            ? [{ name: "Commit", value: `\`${vars.commit.slice(0, 8)}\``, inline: true }]
            : []),
          ...(vars.deployed_by
            ? [{ name: "Deployed By", value: vars.deployed_by, inline: true }]
            : []),
        ],
        footer: {
          text: vars.footer ?? "Deployment Pipeline",
          icon_url: success ? STATUS_ICONS.success : STATUS_ICONS.error,
        },
        timestamp: new Date().toISOString(),
      },
    ],
    ...(vars.url || vars.logs_url
      ? {
          components: [
            multiLinkButtons(
              ...(vars.url ? [{ label: "View Deployment", url: vars.url, emoji: "🔗" }] : []),
              ...(vars.logs_url ? [{ label: "View Logs", url: vars.logs_url, emoji: "📄" }] : []),
            ),
          ],
        }
      : {}),
  };
};

const ciBuild: TemplateRenderer = (vars) => {
  const passed = (vars.status ?? "passed") === "passed";
  return {
    embeds: [
      {
        author: {
          name: vars.author_name ?? "CI Pipeline",
          ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
        },
        title: `${passed ? "🟢" : "🔴"} Build ${passed ? "Passed" : "Failed"} — ${vars.branch ?? "main"}`,
        description: vars.message ?? undefined,
        color: passed ? Colors.success : Colors.error,
        ...(vars.url ? { url: vars.url } : {}),
        fields: [
          ...(vars.repo ? [{ name: "Repository", value: `\`${vars.repo}\``, inline: true }] : []),
          ...(vars.branch ? [{ name: "Branch", value: `\`${vars.branch}\``, inline: true }] : []),
          ...(vars.duration ? [{ name: "Duration", value: vars.duration, inline: true }] : []),
          ...(vars.tests ? [{ name: "Tests", value: vars.tests, inline: true }] : []),
          ...(vars.coverage ? [{ name: "Coverage", value: vars.coverage, inline: true }] : []),
          ...(vars.commit
            ? [{ name: "Commit", value: `\`${vars.commit.slice(0, 8)}\``, inline: true }]
            : []),
        ],
        footer: {
          text: vars.footer ?? "CI Pipeline",
          icon_url: passed ? STATUS_ICONS.success : STATUS_ICONS.error,
        },
        timestamp: new Date().toISOString(),
      },
    ],
    ...(vars.url ? { components: [linkButton("View Build", vars.url, "🔗")] } : {}),
  };
};

const incident: TemplateRenderer = (vars) => {
  const severityColors: Record<string, number> = {
    critical: Colors.error,
    high: Colors.ember,
    medium: Colors.warning,
    low: Colors.info,
  };
  const severity = vars.severity ?? "high";

  return {
    embeds: [
      {
        author: {
          name: vars.author_name ?? "Incident Management",
          ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
        },
        title: `🚨 Incident: ${vars.title ?? "Service Disruption"}`,
        description: vars.description ?? "An incident has been detected.",
        color: severityColors[severity] ?? Colors.error,
        fields: [
          { name: "Severity", value: `\`${severity.toUpperCase()}\``, inline: true },
          { name: "Status", value: vars.status ?? "investigating", inline: true },
          ...(vars.service
            ? [{ name: "Service", value: `\`${vars.service}\``, inline: true }]
            : []),
          ...(vars.started_at
            ? [{ name: "Started", value: toDiscordTimestamp(vars.started_at, "R"), inline: true }]
            : []),
          ...(vars.impact ? [{ name: "📉 Impact", value: vars.impact }] : []),
          ...(vars.workaround ? [{ name: "🔧 Workaround", value: vars.workaround }] : []),
        ],
        footer: { text: vars.footer ?? "Incident Management", icon_url: STATUS_ICONS.error },
        timestamp: new Date().toISOString(),
      },
    ],
    ...(vars.url ? { components: [linkButton("Status Page", vars.url, "🔗")] } : {}),
  };
};

const incidentResolved: TemplateRenderer = (vars) => ({
  embeds: [
    {
      author: {
        name: vars.author_name ?? "Incident Management",
        ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
      },
      title: `✅ Resolved: ${vars.title ?? "Incident"}`,
      description: vars.description ?? "The incident has been resolved.",
      color: Colors.success,
      fields: [
        ...(vars.duration ? [{ name: "⏱️ Duration", value: vars.duration, inline: true }] : []),
        ...(vars.resolved_at
          ? [
              {
                name: "Resolved At",
                value: toDiscordTimestamp(vars.resolved_at, "f"),
                inline: true,
              },
            ]
          : []),
        ...(vars.root_cause ? [{ name: "🔍 Root Cause", value: vars.root_cause }] : []),
        ...(vars.resolution ? [{ name: "🛠️ Resolution", value: vars.resolution }] : []),
        ...(vars.followup ? [{ name: "📋 Follow-up", value: vars.followup }] : []),
      ],
      footer: { text: vars.footer ?? "Incident Management", icon_url: STATUS_ICONS.success },
      timestamp: new Date().toISOString(),
    },
  ],
  ...(vars.url ? { components: [linkButton("Postmortem", vars.url, "📋")] } : {}),
});

const maintenance: TemplateRenderer = (vars) => ({
  embeds: [
    {
      author: {
        name: vars.author_name ?? "Infrastructure",
        ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
      },
      title: `🔧 Scheduled Maintenance: ${vars.title ?? "System Update"}`,
      description: vars.description ?? "Scheduled maintenance window.",
      color: Colors.warning,
      fields: [
        ...(vars.start
          ? [
              {
                name: "🕐 Start",
                value: toDiscordTimestamp(vars.start, "F") + "\n" + discordCountdown(vars.start),
                inline: true,
              },
            ]
          : []),
        ...(vars.end
          ? [
              {
                name: "🕐 End",
                value: toDiscordTimestamp(vars.end, "F") + "\n" + discordCountdown(vars.end),
                inline: true,
              },
            ]
          : []),
        ...(vars.services ? [{ name: "⚠️ Affected Services", value: vars.services }] : []),
        ...(vars.impact ? [{ name: "Expected Impact", value: vars.impact }] : []),
      ],
      footer: { text: vars.footer ?? "Infrastructure", icon_url: STATUS_ICONS.warning },
      timestamp: new Date().toISOString(),
    },
  ],
  ...(vars.url ? { components: [linkButton("Status Page", vars.url, "🔗")] } : {}),
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
        author: {
          name: vars.author_name ?? "Status Monitor",
          ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
        },
        title: `${statusIcons[status] ?? "⚪"} Status: ${vars.title ?? status.charAt(0).toUpperCase() + status.slice(1)}`,
        description: vars.message ?? undefined,
        color: statusColors[status] ?? Colors.frost,
        fields: [
          ...(vars.services ? [{ name: "Services", value: vars.services }] : []),
          ...(vars.uptime ? [{ name: "Uptime", value: vars.uptime, inline: true }] : []),
          ...(vars.response_time
            ? [{ name: "Response Time", value: vars.response_time, inline: true }]
            : []),
          ...(vars.last_incident
            ? [{ name: "Last Incident", value: vars.last_incident, inline: true }]
            : []),
        ],
        footer: {
          text: vars.footer ?? "Status Monitor",
          icon_url:
            statusColors[status] === Colors.success ? STATUS_ICONS.success : STATUS_ICONS.warning,
        },
        timestamp: new Date().toISOString(),
      },
    ],
    ...(vars.url ? { components: [linkButton("View Dashboard", vars.url, "📊")] } : {}),
  };
};

const review: TemplateRenderer = (vars) => ({
  embeds: [
    {
      author: {
        name: vars.author_name ?? "Code Review",
        ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
      },
      title: `🔍 PR: ${vars.title ?? "Pull Request"}`,
      description: vars.summary ?? undefined,
      color: Colors.info,
      ...(vars.url ? { url: vars.url } : {}),
      fields: [
        ...(vars.repo ? [{ name: "Repository", value: `\`${vars.repo}\``, inline: true }] : []),
        ...(vars.author ? [{ name: "Author", value: vars.author, inline: true }] : []),
        ...(vars.branch ? [{ name: "Branch", value: `\`${vars.branch}\``, inline: true }] : []),
        ...(vars.additions
          ? [{ name: "Additions", value: `\`+${vars.additions}\``, inline: true }]
          : []),
        ...(vars.deletions
          ? [{ name: "Deletions", value: `\`-${vars.deletions}\``, inline: true }]
          : []),
        ...(vars.files_changed ? [{ name: "Files", value: vars.files_changed, inline: true }] : []),
        ...(vars.changes ? [{ name: "Changes", value: vars.changes }] : []),
        ...(vars.labels ? [{ name: "Labels", value: vars.labels }] : []),
      ],
      footer: { text: vars.footer ?? "Code Review" },
      timestamp: new Date().toISOString(),
    },
  ],
  ...(vars.url ? { components: [linkButton("Open Pull Request", vars.url, "🔗")] } : {}),
});

// ─── Team & Community ────────────────────────────────────────────────

const celebration: TemplateRenderer = (vars) => ({
  content: vars.mention ?? undefined,
  embeds: [
    {
      author: {
        name: vars.author_name ?? "🥂 Celebrations",
        ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
      },
      title: `🎉 ${vars.title ?? "Celebration!"}`,
      description: vars.message ?? "Something amazing just happened!",
      color: Colors.celebration,
      ...(vars.image ? { image: { url: vars.image } } : {}),
      ...(vars.thumbnail ? { thumbnail: { url: vars.thumbnail } } : {}),
      fields: [
        ...(vars.achievement ? [{ name: "🏆 Achievement", value: vars.achievement }] : []),
        ...(vars.details ? [{ name: "Details", value: vars.details }] : []),
        ...(vars.team ? [{ name: "👥 Team", value: vars.team, inline: true }] : []),
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
      author: {
        name: vars.author_name ?? "Welcome",
        ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
      },
      title: `👋 Welcome${vars.name ? `, ${vars.name}` : ""}!`,
      description: vars.message ?? "We're excited to have you here!",
      color: Colors.ocean,
      ...(vars.avatar ? { thumbnail: { url: vars.avatar } } : {}),
      fields: [
        ...(vars.role ? [{ name: "Role", value: vars.role, inline: true }] : []),
        ...(vars.team ? [{ name: "Team", value: vars.team, inline: true }] : []),
        ...(vars.start_date
          ? [{ name: "Start Date", value: toDiscordTimestamp(vars.start_date, "D"), inline: true }]
          : []),
        ...(vars.intro ? [{ name: "About", value: vars.intro }] : []),
        ...(vars.resources ? [{ name: "📚 Getting Started", value: vars.resources }] : []),
      ],
      footer: { text: vars.footer ?? "Welcome aboard!" },
      timestamp: new Date().toISOString(),
    },
  ],
  ...(vars.handbook_url || vars.onboarding_url
    ? {
        components: [
          multiLinkButtons(
            ...(vars.handbook_url
              ? [{ label: "Handbook", url: vars.handbook_url, emoji: "📖" }]
              : []),
            ...(vars.onboarding_url
              ? [{ label: "Onboarding", url: vars.onboarding_url, emoji: "🚀" }]
              : []),
          ),
        ],
      }
    : {}),
});

const shoutout: TemplateRenderer = (vars) => ({
  content: vars.mention ?? undefined,
  embeds: [
    {
      author: {
        name: vars.author_name ?? "Recognition",
        ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
      },
      title: `⭐ Shoutout${vars.name ? ` to ${vars.name}` : ""}!`,
      description: vars.message ?? "Outstanding work!",
      color: Colors.premium,
      ...(vars.avatar ? { thumbnail: { url: vars.avatar } } : {}),
      fields: [
        ...(vars.achievement ? [{ name: "🏅 For", value: vars.achievement }] : []),
        ...(vars.impact ? [{ name: "💥 Impact", value: vars.impact }] : []),
        ...(vars.nominated_by
          ? [{ name: "Nominated By", value: vars.nominated_by, inline: true }]
          : []),
      ],
      footer: { text: vars.footer ?? "Recognition" },
      timestamp: new Date().toISOString(),
    },
  ],
});

const quote: TemplateRenderer = (vars) => ({
  embeds: [
    {
      description: `>>> *"${vars.text ?? "The best way to predict the future is to invent it."}"*`,
      color: Colors.lavender,
      ...(vars.author_avatar ? { thumbnail: { url: vars.author_avatar } } : {}),
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
      author: {
        name: vars.author_name ?? "Announcement",
        ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
      },
      title: `📢 ${vars.title ?? "Announcement"}`,
      description: vars.message ?? "",
      color: Colors.info,
      ...(vars.link ? { url: vars.link } : {}),
      ...(vars.image ? { image: { url: vars.image } } : {}),
      ...(vars.thumbnail ? { thumbnail: { url: vars.thumbnail } } : {}),
      fields: [
        ...(vars.details ? [{ name: "Details", value: vars.details }] : []),
        ...(vars.action ? [{ name: "⚡ Action Required", value: vars.action }] : []),
        ...(vars.deadline
          ? [
              {
                name: "📅 Deadline",
                value:
                  toDiscordTimestamp(vars.deadline, "F") + "\n" + discordCountdown(vars.deadline),
                inline: true,
              },
            ]
          : []),
      ],
      footer: { text: vars.footer ?? "Announcement" },
      timestamp: new Date().toISOString(),
    },
  ],
  ...(vars.link ? { components: [linkButton("Learn More", vars.link, "🔗")] } : {}),
});

const changelog: TemplateRenderer = (vars) => {
  const sections: TemplateEmbed[] = [];
  const mainEmbed: TemplateEmbed = {
    author: {
      name: vars.author_name ?? "Changelog",
      ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
    },
    title: `📋 ${vars.title ?? "What's New"} ${vars.version ?? ""}`.trim(),
    description: vars.summary ?? undefined,
    color: Colors.mint,
    ...(vars.link ? { url: vars.link } : {}),
    fields: [
      ...(vars.added ? [{ name: "✨ Added", value: vars.added }] : []),
      ...(vars.changed ? [{ name: "🔄 Changed", value: vars.changed }] : []),
      ...(vars.fixed ? [{ name: "🐛 Fixed", value: vars.fixed }] : []),
      ...(vars.removed ? [{ name: "🗑️ Removed", value: vars.removed }] : []),
      ...(vars.deprecated ? [{ name: "⚠️ Deprecated", value: vars.deprecated }] : []),
      ...(vars.security ? [{ name: "🔒 Security", value: vars.security }] : []),
      ...(vars.performance ? [{ name: "⚡ Performance", value: vars.performance }] : []),
    ],
    footer: { text: vars.footer ?? "Changelog" },
    timestamp: new Date().toISOString(),
  };
  sections.push(mainEmbed);

  return {
    embeds: sections,
    ...(vars.link ? { components: [linkButton("Full Changelog", vars.link, "📋")] } : {}),
  };
};

// Import TemplateEmbed for the changelog closure
import type { TemplateEmbed } from "./types.js";

const milestone: TemplateRenderer = (vars) => ({
  content: vars.mention ?? undefined,
  embeds: [
    {
      author: {
        name: vars.author_name ?? "Milestones",
        ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
      },
      title: `🏁 Milestone: ${vars.title ?? "Reached!"}`,
      description: vars.message ?? "A major milestone has been achieved!",
      color: Colors.premium,
      ...(vars.image ? { image: { url: vars.image } } : {}),
      fields: [
        ...(vars.metric ? [{ name: "📊 Metric", value: vars.metric, inline: true }] : []),
        ...(vars.target ? [{ name: "🎯 Target", value: vars.target, inline: true }] : []),
        ...(vars.progress ? [{ name: "📈 Progress", value: vars.progress, inline: true }] : []),
        ...(vars.next ? [{ name: "⏭️ Next Goal", value: vars.next }] : []),
        ...(vars.contributors ? [{ name: "👥 Contributors", value: vars.contributors }] : []),
        ...(vars.deadline
          ? [
              {
                name: "📅 Target Date",
                value:
                  toDiscordTimestamp(vars.deadline, "D") +
                  " (" +
                  discordCountdown(vars.deadline) +
                  ")",
              },
            ]
          : []),
      ],
      footer: { text: vars.footer ?? "Milestones" },
      timestamp: new Date().toISOString(),
    },
  ],
});

const tip: TemplateRenderer = (vars) => ({
  embeds: [
    {
      author: {
        name: vars.author_name ?? "Tips & Tricks",
        ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
      },
      title: `💡 ${vars.title ?? "Pro Tip"}`,
      description: vars.message ?? "",
      color: Colors.sunset,
      fields: [
        ...(vars.example
          ? [{ name: "Example", value: `\`\`\`${vars.language ?? ""}\n${vars.example}\n\`\`\`` }]
          : []),
        ...(vars.why ? [{ name: "💭 Why?", value: vars.why }] : []),
      ],
      footer: { text: vars.footer ?? "Tips & Tricks" },
    },
  ],
  ...(vars.link ? { components: [linkButton("Documentation", vars.link, "📖")] } : {}),
});

const poll: TemplateRenderer = (vars) => {
  const options = (vars.options ?? "").split("|").filter(Boolean);

  // Native Discord poll when options are provided
  if (options.length > 0) {
    const pollData: TemplatePoll = {
      question: vars.question ?? "Poll",
      answers: options.map((opt) => {
        const trimmed = opt.trim();
        return { text: trimmed };
      }),
      ...(vars.duration ? { duration: parseInt(vars.duration, 10) || 24 } : {}),
      ...(vars.multiselect === "true" ? { allow_multiselect: true } : {}),
    };

    return {
      content: vars.mention ?? undefined,
      embeds: [],
      poll: pollData,
    };
  }

  // Fallback embed poll when no options (just a question)
  return {
    embeds: [
      {
        title: `📊 ${vars.question ?? "Poll"}`,
        description: vars.message ?? "Share your thoughts!",
        color: Colors.info,
        footer: { text: vars.footer ?? "Poll" },
      },
    ],
  };
};

// ─── New Templates ───────────────────────────────────────────────────

/**
 * Multi-embed dashboard — shows multiple services with individual status cards.
 */
const dashboard: TemplateRenderer = (vars) => {
  const services = (vars.services ?? "").split("|").filter(Boolean);
  const statuses = (vars.statuses ?? "").split("|").filter(Boolean);

  const statusColor: Record<string, number> = {
    operational: Colors.success,
    degraded: Colors.warning,
    outage: Colors.error,
    maintenance: Colors.frost,
  };
  const statusEmoji: Record<string, string> = {
    operational: "🟢",
    degraded: "🟡",
    outage: "🔴",
    maintenance: "🔵",
  };

  const headerEmbed: TemplateEmbed = {
    author: {
      name: vars.author_name ?? "Service Dashboard",
      ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
    },
    title: `📊 ${vars.title ?? "System Status"}`,
    description: vars.message ?? undefined,
    color: Colors.calm,
    ...(vars.uptime
      ? { fields: [{ name: "Overall Uptime", value: vars.uptime, inline: true }] }
      : {}),
    footer: { text: vars.footer ?? "Status Dashboard" },
    timestamp: new Date().toISOString(),
  };

  const serviceEmbeds: TemplateEmbed[] = services.map((svc, i) => {
    const status = (statuses[i] ?? "operational").trim().toLowerCase();
    return {
      title: `${statusEmoji[status] ?? "⚪"} ${svc.trim()}`,
      color: statusColor[status] ?? Colors.frost,
      description: `Status: **${status.charAt(0).toUpperCase() + status.slice(1)}**`,
    };
  });

  // Discord allows max 10 embeds — header + up to 9 services
  const allEmbeds = [headerEmbed, ...serviceEmbeds.slice(0, 9)];

  return {
    embeds: allEmbeds,
    ...(vars.url ? { components: [linkButton("Full Dashboard", vars.url, "📊")] } : {}),
  };
};

/**
 * Progress update — visual progress bar using Unicode blocks.
 */
const progress: TemplateRenderer = (vars) => {
  const pct = Math.min(100, Math.max(0, parseInt(vars.percent ?? "0", 10)));
  const filled = Math.round(pct / 5);
  const empty = 20 - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);

  return {
    embeds: [
      {
        author: {
          name: vars.author_name ?? "Progress",
          ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
        },
        title: vars.title ?? "Progress Update",
        description: `\`${bar}\` **${pct}%**\n\n${vars.message ?? ""}`.trim(),
        color: pct >= 100 ? Colors.success : pct >= 50 ? Colors.mint : Colors.info,
        fields: [
          ...(vars.completed
            ? [{ name: "✅ Completed", value: vars.completed, inline: true }]
            : []),
          ...(vars.remaining
            ? [{ name: "⏳ Remaining", value: vars.remaining, inline: true }]
            : []),
          ...(vars.deadline
            ? [
                {
                  name: "📅 Deadline",
                  value:
                    toDiscordTimestamp(vars.deadline, "D") +
                    " (" +
                    discordCountdown(vars.deadline) +
                    ")",
                  inline: true,
                },
              ]
            : []),
          ...(vars.blockers ? [{ name: "🚫 Blockers", value: vars.blockers }] : []),
        ],
        footer: { text: vars.footer ?? "Progress Tracker" },
        timestamp: new Date().toISOString(),
      },
    ],
  };
};

/**
 * On-call / handoff — shift transition notification.
 */
const oncall: TemplateRenderer = (vars) => ({
  content: vars.mention ?? undefined,
  embeds: [
    {
      author: {
        name: vars.author_name ?? "On-Call",
        ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
      },
      title: "🔔 On-Call Handoff",
      description: vars.message ?? "On-call rotation update.",
      color: Colors.sunset,
      fields: [
        ...(vars.outgoing ? [{ name: "📤 Outgoing", value: vars.outgoing, inline: true }] : []),
        ...(vars.incoming ? [{ name: "📥 Incoming", value: vars.incoming, inline: true }] : []),
        ...(vars.shift_start
          ? [
              {
                name: "🕐 Shift Start",
                value:
                  toDiscordTimestamp(vars.shift_start, "F") +
                  "\n" +
                  discordCountdown(vars.shift_start),
              },
            ]
          : []),
        ...(vars.notes ? [{ name: "📝 Handoff Notes", value: vars.notes }] : []),
        ...(vars.active_incidents
          ? [{ name: "🚨 Active Incidents", value: vars.active_incidents }]
          : []),
      ],
      footer: { text: vars.footer ?? "On-Call Rotation" },
      timestamp: new Date().toISOString(),
    },
  ],
  ...(vars.runbook_url ? { components: [linkButton("Runbook", vars.runbook_url, "📖")] } : {}),
});

/**
 * Standup — daily standup summary.
 */
const standup: TemplateRenderer = (vars) => ({
  embeds: [
    {
      author: {
        name: vars.author_name ?? vars.name ?? "Standup",
        ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
      },
      title: `📝 ${vars.name ? `${vars.name}'s ` : ""}Standup — ${vars.date ?? new Date().toLocaleDateString()}`,
      color: Colors.ocean,
      fields: [
        ...(vars.yesterday ? [{ name: "✅ Yesterday", value: vars.yesterday }] : []),
        ...(vars.today ? [{ name: "📋 Today", value: vars.today }] : []),
        ...(vars.blockers ? [{ name: "🚫 Blockers", value: vars.blockers }] : []),
        ...(vars.mood ? [{ name: "Feeling", value: vars.mood, inline: true }] : []),
      ],
      footer: { text: vars.footer ?? "Daily Standup" },
      timestamp: new Date().toISOString(),
    },
  ],
});

/**
 * Retrospective — sprint retro summary.
 */
const retro: TemplateRenderer = (vars) => ({
  embeds: [
    {
      author: {
        name: vars.author_name ?? "Retrospective",
        ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
      },
      title: `🔄 ${vars.title ?? "Sprint Retrospective"}`,
      description: vars.summary ?? undefined,
      color: Colors.lavender,
      fields: [
        ...(vars.went_well ? [{ name: "✅ What Went Well", value: vars.went_well }] : []),
        ...(vars.improve ? [{ name: "📈 What to Improve", value: vars.improve }] : []),
        ...(vars.action_items ? [{ name: "⚡ Action Items", value: vars.action_items }] : []),
        ...(vars.kudos ? [{ name: "⭐ Kudos", value: vars.kudos }] : []),
        ...(vars.sprint ? [{ name: "Sprint", value: vars.sprint, inline: true }] : []),
        ...(vars.velocity ? [{ name: "Velocity", value: vars.velocity, inline: true }] : []),
      ],
      footer: { text: vars.footer ?? "Retrospective" },
      timestamp: new Date().toISOString(),
    },
  ],
});

/**
 * Alert — generic alert with configurable level.
 */
const alert: TemplateRenderer = (vars) => {
  const levelColors: Record<string, number> = {
    info: Colors.info,
    warning: Colors.warning,
    error: Colors.error,
    critical: Colors.ember,
  };
  const levelEmojis: Record<string, string> = {
    info: "ℹ️",
    warning: "⚠️",
    error: "❌",
    critical: "🔥",
  };
  const level = vars.level ?? "info";

  return {
    embeds: [
      {
        author: {
          name: vars.author_name ?? vars.source ?? "Alert System",
          ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
        },
        title: `${levelEmojis[level] ?? "ℹ️"} ${vars.title ?? "Alert"}`,
        description: vars.message ?? "",
        color: levelColors[level] ?? Colors.info,
        fields: [
          ...(vars.source ? [{ name: "Source", value: `\`${vars.source}\``, inline: true }] : []),
          ...(vars.metric ? [{ name: "Metric", value: vars.metric, inline: true }] : []),
          ...(vars.threshold ? [{ name: "Threshold", value: vars.threshold, inline: true }] : []),
          ...(vars.current_value
            ? [{ name: "Current", value: vars.current_value, inline: true }]
            : []),
          ...(vars.action ? [{ name: "⚡ Action", value: vars.action }] : []),
        ],
        footer: {
          text: vars.footer ?? "Alert System",
          icon_url: levelColors[level] === Colors.error ? STATUS_ICONS.error : STATUS_ICONS.warning,
        },
        timestamp: new Date().toISOString(),
      },
    ],
    ...(vars.url ? { components: [linkButton("View Details", vars.url, "🔗")] } : {}),
  };
};

/**
 * Simple — minimal branded embed. Auto-used by send_message for polished output.
 * Just wraps text in a color bar + description + timestamp + optional author.
 */
const simple: TemplateRenderer = (vars) => ({
  embeds: [
    {
      ...(vars.title ? { title: vars.title } : {}),
      description: vars.message ?? "",
      color: Colors[vars.color as keyof typeof Colors] ?? Colors.info,
      ...(vars.author_name
        ? {
            author: {
              name: vars.author_name,
              ...(vars.author_icon ? { icon_url: vars.author_icon } : {}),
            },
          }
        : {}),
      footer: { text: vars.footer ?? "" },
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
  features?: string[];
}

export const templates: Record<string, TemplateInfo> = {
  // DevOps
  release: {
    name: "release",
    category: "devops",
    description:
      "Version release announcement with highlights, breaking changes, install instructions, and link buttons",
    requiredVars: ["version"],
    optionalVars: [
      "name",
      "notes",
      "highlights",
      "breaking",
      "link",
      "npm",
      "npm_url",
      "docs_url",
      "migration",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: release,
    features: ["author", "link_buttons", "clickable_title"],
  },
  deploy: {
    name: "deploy",
    category: "devops",
    description:
      "Deployment notification with status, environment, commit, duration, and view/logs buttons",
    requiredVars: [],
    optionalVars: [
      "status",
      "environment",
      "version",
      "duration",
      "commit",
      "url",
      "logs_url",
      "message",
      "deployed_by",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: deploy,
    features: ["author", "footer_icon", "link_buttons", "clickable_title"],
  },
  ci_build: {
    name: "ci_build",
    category: "devops",
    description: "CI build result with branch, tests, coverage, duration, and build link button",
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
      "author_name",
      "author_icon",
    ],
    render: ciBuild,
    features: ["author", "footer_icon", "link_buttons", "clickable_title"],
  },
  incident: {
    name: "incident",
    category: "devops",
    description:
      "Incident alert with severity-based colors, Discord timestamps, workaround, and status page button",
    requiredVars: ["title"],
    optionalVars: [
      "description",
      "severity",
      "status",
      "service",
      "impact",
      "workaround",
      "started_at",
      "url",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: incident,
    features: ["author", "footer_icon", "link_buttons", "discord_timestamps"],
  },
  incident_resolved: {
    name: "incident_resolved",
    category: "devops",
    description: "Incident resolution with root cause, duration, follow-up, and postmortem button",
    requiredVars: ["title"],
    optionalVars: [
      "description",
      "duration",
      "root_cause",
      "resolution",
      "followup",
      "resolved_at",
      "url",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: incidentResolved,
    features: ["author", "footer_icon", "link_buttons", "discord_timestamps"],
  },
  maintenance: {
    name: "maintenance",
    category: "devops",
    description:
      "Scheduled maintenance with Discord timestamps (auto-timezone), live countdowns, and status page button",
    requiredVars: ["title"],
    optionalVars: [
      "description",
      "start",
      "end",
      "services",
      "impact",
      "url",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: maintenance,
    features: ["author", "footer_icon", "link_buttons", "discord_timestamps", "countdown"],
  },
  status_update: {
    name: "status_update",
    category: "devops",
    description:
      "Service status (operational/degraded/outage/maintenance) with uptime, response time, and dashboard button",
    requiredVars: ["status"],
    optionalVars: [
      "title",
      "message",
      "services",
      "uptime",
      "response_time",
      "last_incident",
      "url",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: statusUpdate,
    features: ["author", "footer_icon", "link_buttons"],
  },
  review: {
    name: "review",
    category: "devops",
    description:
      "Pull request review request with repo, author, branch, diff stats, labels, and PR link button",
    requiredVars: ["title"],
    optionalVars: [
      "summary",
      "repo",
      "author",
      "branch",
      "changes",
      "additions",
      "deletions",
      "files_changed",
      "labels",
      "url",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: review,
    features: ["author", "link_buttons", "clickable_title"],
  },

  // Team & Community
  celebration: {
    name: "celebration",
    category: "team",
    description: "Celebrate wins with team attribution, images, and achievement highlights",
    requiredVars: [],
    optionalVars: [
      "title",
      "message",
      "achievement",
      "details",
      "team",
      "image",
      "thumbnail",
      "mention",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: celebration,
    features: ["author", "thumbnail", "image"],
  },
  welcome: {
    name: "welcome",
    category: "team",
    description:
      "Welcome new team members with avatar, Discord timestamps for start date, and onboarding buttons",
    requiredVars: [],
    optionalVars: [
      "name",
      "message",
      "role",
      "team",
      "start_date",
      "intro",
      "resources",
      "avatar",
      "mention",
      "handbook_url",
      "onboarding_url",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: welcome,
    features: ["author", "link_buttons", "discord_timestamps", "thumbnail"],
  },
  shoutout: {
    name: "shoutout",
    category: "team",
    description: "Recognize outstanding work with avatar thumbnail and nomination attribution",
    requiredVars: [],
    optionalVars: [
      "name",
      "message",
      "achievement",
      "impact",
      "nominated_by",
      "avatar",
      "mention",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: shoutout,
    features: ["author", "thumbnail"],
  },
  quote: {
    name: "quote",
    category: "team",
    description:
      "Share an inspirational quote with block-quote formatting and optional author avatar",
    requiredVars: ["text"],
    optionalVars: ["author", "source", "author_avatar", "footer"],
    render: quote,
    features: ["block_quote", "thumbnail"],
  },
  announcement: {
    name: "announcement",
    category: "team",
    description:
      "General announcement with action items, Discord timestamp deadlines with countdowns, and link buttons",
    requiredVars: ["title"],
    optionalVars: [
      "message",
      "details",
      "action",
      "deadline",
      "link",
      "image",
      "thumbnail",
      "mention",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: announcement,
    features: [
      "author",
      "link_buttons",
      "clickable_title",
      "discord_timestamps",
      "countdown",
      "image",
    ],
  },
  changelog: {
    name: "changelog",
    category: "team",
    description:
      "Changelog with added/changed/fixed/removed/deprecated/security/performance sections and link buttons",
    requiredVars: [],
    optionalVars: [
      "title",
      "version",
      "summary",
      "added",
      "changed",
      "fixed",
      "removed",
      "deprecated",
      "security",
      "performance",
      "link",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: changelog,
    features: ["author", "link_buttons", "clickable_title"],
  },
  milestone: {
    name: "milestone",
    category: "team",
    description:
      "Project milestone with progress, target dates as Discord timestamps, and contributor highlights",
    requiredVars: ["title"],
    optionalVars: [
      "message",
      "metric",
      "target",
      "progress",
      "next",
      "contributors",
      "deadline",
      "image",
      "mention",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: milestone,
    features: ["author", "discord_timestamps", "countdown", "image"],
  },
  tip: {
    name: "tip",
    category: "team",
    description:
      "Pro tip with syntax-highlighted code examples, explanation, and documentation button",
    requiredVars: ["message"],
    optionalVars: [
      "title",
      "example",
      "language",
      "why",
      "link",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: tip,
    features: ["author", "link_buttons", "syntax_highlight"],
  },
  poll: {
    name: "poll",
    category: "team",
    description:
      "Native Discord poll with progress bars and vote tracking (pipe-separated options). Supports multiselect and duration (hours)",
    requiredVars: ["question"],
    optionalVars: ["options", "duration", "multiselect", "message", "mention", "footer"],
    render: poll,
    features: ["native_poll"],
  },

  // New Templates
  dashboard: {
    name: "dashboard",
    category: "devops",
    description:
      "Multi-embed service dashboard — header + individual service status cards (up to 9 services). Pipe-separate services and statuses",
    requiredVars: ["services", "statuses"],
    optionalVars: ["title", "message", "uptime", "url", "footer", "author_name", "author_icon"],
    render: dashboard,
    features: ["author", "multi_embed", "link_buttons"],
  },
  progress: {
    name: "progress",
    category: "team",
    description:
      "Visual progress bar with percentage, completion stats, blockers, and deadline countdown",
    requiredVars: ["percent"],
    optionalVars: [
      "title",
      "message",
      "completed",
      "remaining",
      "deadline",
      "blockers",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: progress,
    features: ["author", "progress_bar", "discord_timestamps", "countdown"],
  },
  oncall: {
    name: "oncall",
    category: "devops",
    description:
      "On-call handoff with incoming/outgoing rotation, shift timestamps, handoff notes, and runbook button",
    requiredVars: [],
    optionalVars: [
      "outgoing",
      "incoming",
      "shift_start",
      "notes",
      "active_incidents",
      "runbook_url",
      "message",
      "mention",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: oncall,
    features: ["author", "link_buttons", "discord_timestamps", "countdown"],
  },
  standup: {
    name: "standup",
    category: "team",
    description: "Daily standup summary with yesterday/today/blockers sections",
    requiredVars: [],
    optionalVars: [
      "name",
      "date",
      "yesterday",
      "today",
      "blockers",
      "mood",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: standup,
    features: ["author"],
  },
  retro: {
    name: "retro",
    category: "team",
    description:
      "Sprint retrospective with went-well/improve/action-items sections and velocity tracking",
    requiredVars: [],
    optionalVars: [
      "title",
      "summary",
      "went_well",
      "improve",
      "action_items",
      "kudos",
      "sprint",
      "velocity",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: retro,
    features: ["author"],
  },
  alert: {
    name: "alert",
    category: "devops",
    description:
      "Configurable alert with level-based styling (info/warning/error/critical), source, metric thresholds, and action",
    requiredVars: ["title"],
    optionalVars: [
      "level",
      "message",
      "source",
      "metric",
      "threshold",
      "current_value",
      "action",
      "url",
      "footer",
      "author_name",
      "author_icon",
    ],
    render: alert,
    features: ["author", "footer_icon", "link_buttons"],
  },

  // Utility
  simple: {
    name: "simple",
    category: "utility",
    description:
      "Minimal branded embed — color bar, description, timestamp, optional author. Auto-used by send_message for polished output",
    requiredVars: ["message"],
    optionalVars: ["title", "color", "footer", "author_name", "author_icon"],
    render: simple,
    features: ["author"],
  },
};

export function getTemplate(name: string): TemplateInfo | undefined {
  return templates[name];
}

export function listTemplates(): TemplateInfo[] {
  return Object.values(templates).filter((t) => t.name !== "simple");
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
