import { createInterface } from "node:readline/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { stdin, stdout } from "node:process";
import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import { logger } from "../utils/logger.js";
import type { GlobalConfig, ProjectConfig } from "../config/schema.js";
import type { NotificationType } from "../config/schema.js";

const GLOBAL_CONFIG_PATH = resolve(homedir(), ".discord-ops.json");

const NOTIFICATION_TYPES: NotificationType[] = [
  "ci_build",
  "deploy",
  "release",
  "error",
  "announcement",
  "dev",
];

const SUGGESTED_ALIASES = [
  "dev",
  "builds",
  "alerts",
  "releases",
  "general",
  "announcements",
  "errors",
  "deploys",
];

interface GuildInfo {
  id: string;
  name: string;
}

interface ChannelInfo {
  id: string;
  name: string;
  type: ChannelType;
}

/**
 * Interactive setup wizard for discord-ops configuration.
 * Walks users through bot token verification, guild selection,
 * channel aliasing, and notification routing.
 */
export async function runSetup(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log("\n  discord-ops setup wizard\n");
  console.log("  This wizard will help you configure discord-ops");
  console.log("  by connecting to your Discord bot and mapping");
  console.log("  guilds and channels to project aliases.\n");

  try {
    // Step 1: Check for existing config
    const existingConfig = await checkExistingConfig(rl);

    // Step 2: Obtain Discord token
    const token = await obtainToken(rl);

    // Step 3: Connect to Discord and verify token
    console.log("\n  Connecting to Discord...");
    const client = await connectBot(token);
    console.log(`  Connected as: ${client.user?.tag}`);

    // Step 4: List available guilds
    const guilds = await listGuilds(client);
    if (guilds.length === 0) {
      console.log("\n  Bot is not a member of any guilds.");
      console.log("  Invite the bot to at least one server first.");
      await cleanup(client, rl);
      process.exit(1);
    }

    console.log(`\n  Available guilds (${guilds.length}):`);
    for (let i = 0; i < guilds.length; i++) {
      console.log(`    [${i + 1}] ${guilds[i].name} (${guilds[i].id})`);
    }

    // Step 5: Select guilds to configure as projects
    const selectedGuilds = await selectGuilds(rl, guilds);

    // Step 6: Configure each guild — channels and aliases
    const projects: Record<string, ProjectConfig> = {};
    if (existingConfig?.projects) {
      Object.assign(projects, existingConfig.projects);
    }

    for (const guild of selectedGuilds) {
      const projectName = await askQuestion(
        rl,
        `\n  Project name for "${guild.name}" [${slugify(guild.name)}]: `,
      );
      const name = projectName.trim() || slugify(guild.name);

      const channels = await listChannels(client, guild.id);
      if (channels.length === 0) {
        console.log(`    No text channels found in ${guild.name}, skipping.`);
        continue;
      }

      console.log(`\n  Text channels in ${guild.name}:`);
      for (let i = 0; i < channels.length; i++) {
        console.log(`    [${i + 1}] #${channels[i].name} (${channels[i].id})`);
      }

      const channelMap = await assignChannelAliases(rl, channels);
      const defaultChannel = await selectDefaultChannel(rl, channelMap);

      projects[name] = {
        guild_id: guild.id,
        channels: channelMap,
        default_channel: defaultChannel,
      };
    }

    // Step 7: Set default project
    const projectNames = Object.keys(projects);
    let defaultProject: string | undefined;

    if (projectNames.length === 1) {
      defaultProject = projectNames[0];
      console.log(`\n  Default project: ${defaultProject} (only project)`);
    } else if (projectNames.length > 1) {
      console.log("\n  Configured projects:");
      for (let i = 0; i < projectNames.length; i++) {
        console.log(`    [${i + 1}] ${projectNames[i]}`);
      }
      const choice = await askQuestion(rl, `  Default project [1]: `);
      const idx = parseInt(choice.trim() || "1", 10) - 1;
      if (idx >= 0 && idx < projectNames.length) {
        defaultProject = projectNames[idx];
      }
    }

    // Step 8: Configure notification routing
    const notificationRouting = await configureNotificationRouting(rl, projects, defaultProject);

    // Step 9: Build and write global config
    const config: GlobalConfig = {
      projects,
      default_project: defaultProject,
      notification_routing:
        Object.keys(notificationRouting).length > 0 ? notificationRouting : undefined,
    };

    writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
    console.log(`\n  Global config written to: ${GLOBAL_CONFIG_PATH}`);

    // Step 10: Optionally generate per-project config
    await maybeGeneratePerProjectConfig(rl, config);

    console.log("\n  Setup complete. Run `discord-ops health` to verify.\n");

    await cleanup(client, rl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Setup wizard failed", { error: message });
    console.error(`\n  Setup failed: ${message}\n`);
    rl.close();
    process.exit(1);
  }
}

async function checkExistingConfig(
  rl: ReturnType<typeof createInterface>,
): Promise<GlobalConfig | null> {
  if (!existsSync(GLOBAL_CONFIG_PATH)) {
    console.log("  No existing config found. Starting fresh.\n");
    return null;
  }

  console.log(`  Found existing config: ${GLOBAL_CONFIG_PATH}\n`);

  try {
    const raw = JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, "utf-8")) as GlobalConfig;
    const projectCount = Object.keys(raw.projects ?? {}).length;
    console.log(`  Current config has ${projectCount} project(s).`);

    const action = await askQuestion(rl, "  [u]pdate existing / [o]verwrite / [q]uit? [u]: ");
    const choice = action.trim().toLowerCase() || "u";

    if (choice === "q") {
      console.log("  Setup cancelled.");
      rl.close();
      process.exit(0);
    }

    if (choice === "o") {
      console.log("  Starting fresh (existing config will be overwritten).\n");
      return null;
    }

    console.log("  Updating existing config.\n");
    return raw;
  } catch {
    console.log("  Existing config is invalid. Starting fresh.\n");
    return null;
  }
}

async function obtainToken(rl: ReturnType<typeof createInterface>): Promise<string> {
  const envToken = process.env.DISCORD_TOKEN;

  if (envToken) {
    console.log("  DISCORD_TOKEN environment variable detected.");
    const useEnv = await askQuestion(rl, "  Use this token? [Y/n]: ");
    if (useEnv.trim().toLowerCase() !== "n") {
      return envToken;
    }
  }

  const token = await askQuestion(rl, "  Enter Discord bot token: ");
  const trimmed = token.trim();

  if (!trimmed) {
    throw new Error("No token provided. Set DISCORD_TOKEN or enter one manually.");
  }

  if (trimmed.length < 50) {
    throw new Error("Token appears too short. Discord bot tokens are at least 50 characters.");
  }

  return trimmed;
}

async function connectBot(token: string): Promise<Client> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  await client.login(token);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for Discord connection (10s)"));
    }, 10_000);

    if (client.isReady()) {
      clearTimeout(timeout);
      resolve();
    } else {
      client.once("ready", () => {
        clearTimeout(timeout);
        resolve();
      });
    }
  });

  return client;
}

async function listGuilds(client: Client): Promise<GuildInfo[]> {
  const guilds: GuildInfo[] = [];
  for (const [id, guild] of client.guilds.cache) {
    guilds.push({ id, name: guild.name });
  }
  return guilds.sort((a, b) => a.name.localeCompare(b.name));
}

async function selectGuilds(
  rl: ReturnType<typeof createInterface>,
  guilds: GuildInfo[],
): Promise<GuildInfo[]> {
  if (guilds.length === 1) {
    const confirm = await askQuestion(rl, `\n  Configure "${guilds[0].name}"? [Y/n]: `);
    if (confirm.trim().toLowerCase() === "n") {
      throw new Error("No guilds selected. Nothing to configure.");
    }
    return guilds;
  }

  const input = await askQuestion(
    rl,
    `\n  Select guilds to configure (comma-separated numbers, or 'all') [all]: `,
  );
  const choice = input.trim().toLowerCase() || "all";

  if (choice === "all") {
    return guilds;
  }

  const indices = choice
    .split(",")
    .map((s) => parseInt(s.trim(), 10) - 1)
    .filter((i) => i >= 0 && i < guilds.length);

  if (indices.length === 0) {
    throw new Error("No valid guilds selected.");
  }

  return indices.map((i) => guilds[i]);
}

async function listChannels(client: Client, guildId: string): Promise<ChannelInfo[]> {
  const guild = await client.guilds.fetch(guildId);
  const allChannels = await guild.channels.fetch();

  const textChannels: ChannelInfo[] = [];
  for (const [, channel] of allChannels) {
    if (channel && channel.type === ChannelType.GuildText) {
      textChannels.push({
        id: channel.id,
        name: channel.name,
        type: channel.type,
      });
    }
  }

  return textChannels.sort((a, b) => a.name.localeCompare(b.name));
}

async function assignChannelAliases(
  rl: ReturnType<typeof createInterface>,
  channels: ChannelInfo[],
): Promise<Record<string, string>> {
  console.log(`\n  Assign aliases to channels. Suggested: ${SUGGESTED_ALIASES.join(", ")}`);
  console.log("  Enter channel number and alias, or press Enter to skip.");
  console.log('  Format: <number>=<alias>  (e.g., "1=dev" or "3=alerts")');
  console.log('  Type "done" when finished.\n');

  const channelMap: Record<string, string> = {};

  // Auto-suggest aliases based on channel names
  const autoMatched: string[] = [];
  for (const ch of channels) {
    const matchedAlias = SUGGESTED_ALIASES.find(
      (alias) => ch.name.includes(alias) || alias.includes(ch.name),
    );
    if (matchedAlias && !Object.values(channelMap).includes(matchedAlias)) {
      channelMap[matchedAlias] = ch.id;
      autoMatched.push(`${matchedAlias} -> #${ch.name}`);
    }
  }

  if (autoMatched.length > 0) {
    console.log("  Auto-matched channels:");
    for (const m of autoMatched) {
      console.log(`    ${m}`);
    }
    const keepAuto = await askQuestion(rl, "\n  Keep auto-matched aliases? [Y/n]: ");
    if (keepAuto.trim().toLowerCase() === "n") {
      for (const key of Object.keys(channelMap)) {
        delete channelMap[key];
      }
    }
  }

  // Manual assignment loop
  while (true) {
    const input = await askQuestion(rl, "  Assign (number=alias or 'done'): ");
    const trimmed = input.trim().toLowerCase();

    if (trimmed === "done" || trimmed === "") {
      if (Object.keys(channelMap).length === 0) {
        console.log("  Warning: No channels aliased. At least one is recommended.");
        const cont = await askQuestion(rl, "  Continue anyway? [y/N]: ");
        if (cont.trim().toLowerCase() !== "y") continue;
      }
      break;
    }

    const match = trimmed.match(/^(\d+)\s*=\s*(.+)$/);
    if (!match) {
      console.log('  Invalid format. Use "number=alias" (e.g., "1=dev").');
      continue;
    }

    const idx = parseInt(match[1], 10) - 1;
    const alias = match[2].trim();

    if (idx < 0 || idx >= channels.length) {
      console.log(`  Invalid channel number. Choose 1-${channels.length}.`);
      continue;
    }

    channelMap[alias] = channels[idx].id;
    console.log(`    ${alias} -> #${channels[idx].name}`);
  }

  return channelMap;
}

async function selectDefaultChannel(
  rl: ReturnType<typeof createInterface>,
  channelMap: Record<string, string>,
): Promise<string | undefined> {
  const aliases = Object.keys(channelMap);
  if (aliases.length === 0) return undefined;

  if (aliases.length === 1) {
    console.log(`  Default channel: ${aliases[0]} (only channel)`);
    return aliases[0];
  }

  console.log("\n  Available aliases:");
  for (let i = 0; i < aliases.length; i++) {
    console.log(`    [${i + 1}] ${aliases[i]}`);
  }

  const choice = await askQuestion(rl, `  Default channel [1]: `);
  const idx = parseInt(choice.trim() || "1", 10) - 1;

  if (idx >= 0 && idx < aliases.length) {
    return aliases[idx];
  }

  return aliases[0];
}

async function configureNotificationRouting(
  rl: ReturnType<typeof createInterface>,
  projects: Record<string, ProjectConfig>,
  defaultProject?: string,
): Promise<Record<string, string>> {
  const routing: Record<string, string> = {};

  const wantRouting = await askQuestion(rl, "\n  Configure notification routing? [y/N]: ");
  if (wantRouting.trim().toLowerCase() !== "y") {
    return routing;
  }

  // Collect all available channel aliases across projects
  const projectName = defaultProject ?? Object.keys(projects)[0];
  const project = projectName ? projects[projectName] : undefined;

  if (!project) {
    console.log("  No project available for routing. Skipping.");
    return routing;
  }

  const aliases = Object.keys(project.channels);
  if (aliases.length === 0) {
    console.log("  No channel aliases configured. Skipping routing.");
    return routing;
  }

  console.log(`\n  Route notification types to channels in "${projectName}":`);
  console.log(`  Available aliases: ${aliases.join(", ")}`);
  console.log("  Press Enter to skip a type.\n");

  for (const type of NOTIFICATION_TYPES) {
    const suggestion = aliases.find(
      (a) =>
        (type === "ci_build" && (a === "builds" || a === "dev")) ||
        (type === "deploy" && (a === "deploys" || a === "releases")) ||
        (type === "release" && (a === "releases" || a === "announcements")) ||
        (type === "error" && (a === "errors" || a === "alerts")) ||
        (type === "announcement" && (a === "announcements" || a === "general")) ||
        (type === "dev" && a === "dev"),
    );

    const hint = suggestion ? ` [${suggestion}]` : "";
    const answer = await askQuestion(rl, `    ${type}${hint}: `);
    const alias = answer.trim() || suggestion;

    if (alias && aliases.includes(alias)) {
      routing[type] = alias;
    } else if (alias) {
      console.log(`      "${alias}" is not a known alias, skipping.`);
    }
  }

  return routing;
}

async function maybeGeneratePerProjectConfig(
  rl: ReturnType<typeof createInterface>,
  config: GlobalConfig,
): Promise<void> {
  const projectNames = Object.keys(config.projects);
  if (projectNames.length === 0) return;

  const wantLocal = await askQuestion(
    rl,
    "  Generate .discord-ops.json in current directory? [y/N]: ",
  );
  if (wantLocal.trim().toLowerCase() !== "y") return;

  let projectName: string;
  if (projectNames.length === 1) {
    projectName = projectNames[0];
  } else {
    console.log("\n  Which project for this directory?");
    for (let i = 0; i < projectNames.length; i++) {
      console.log(`    [${i + 1}] ${projectNames[i]}`);
    }
    const choice = await askQuestion(rl, `  Select [1]: `);
    const idx = parseInt(choice.trim() || "1", 10) - 1;
    projectName = projectNames[idx >= 0 && idx < projectNames.length ? idx : 0];
  }

  const perProject = {
    project: projectName,
    notification_routing: config.notification_routing,
  };

  const localPath = join(process.cwd(), ".discord-ops.json");
  writeFileSync(localPath, JSON.stringify(perProject, null, 2) + "\n", "utf-8");
  console.log(`  Per-project config written to: ${localPath}`);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function askQuestion(
  rl: ReturnType<typeof createInterface>,
  question: string,
): Promise<string> {
  return rl.question(question);
}

async function cleanup(client: Client, rl: ReturnType<typeof createInterface>): Promise<void> {
  client.destroy();
  rl.close();
}
