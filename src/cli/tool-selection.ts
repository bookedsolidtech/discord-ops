import type { ServerOptions } from "../server.js";

/** Subcommands that start an MCP server. `undefined` is the default stdio server. */
const SERVER_COMMANDS = new Set([undefined, "serve"]);

/**
 * Builds the MCP server options from the command line.
 *
 * `--profile` and `--tools` narrow the tool set, so a selection that cannot be
 * applied must refuse rather than start the full set. This throws on a flag
 * with no value, a flag given twice, both flags together, an empty `--tools`
 * list, or either flag on a subcommand that does not start a server. Profile
 * and tool names are checked against the registry by `filterTools`, which
 * throws on an unknown name.
 */
export function serverOptionsFromArgs(args: string[]): ServerOptions {
  const end = args.indexOf("--");
  const scanned = end === -1 ? args : args.slice(0, end);
  const profile = flagValue(scanned, "--profile");
  const toolList = flagValue(scanned, "--tools");

  if (profile === undefined && toolList === undefined) {
    return { dryRun: scanned.includes("--dry-run") };
  }
  const command = scanned[0]?.startsWith("--") ? undefined : scanned[0];
  if (!SERVER_COMMANDS.has(command)) {
    throw new Error(`--profile and --tools apply only to the MCP server, not "${command}"`);
  }
  if (profile !== undefined && toolList !== undefined) {
    throw new Error("Use --profile or --tools, not both");
  }

  const options: ServerOptions = { dryRun: scanned.includes("--dry-run") };
  if (profile !== undefined) options.profile = profile;
  if (toolList !== undefined) {
    const tools = toolList
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (tools.length === 0) throw new Error("--tools needs at least one tool name");
    options.tools = tools;
  }
  return options;
}

function flagValue(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  if (at === -1) return undefined;
  if (args.indexOf(flag, at + 1) !== -1) throw new Error(`${flag} given more than once`);
  const value = args[at + 1];
  if (value === undefined || value.startsWith("--") || value.trim() === "") {
    throw new Error(`${flag} needs a value`);
  }
  return value;
}
