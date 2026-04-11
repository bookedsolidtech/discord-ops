/** Known double-dash flags accepted by the CLI. */
export const KNOWN_FLAGS = new Set([
  "--help",
  "--version",
  "--port",
  "--allowed-origin",
  "--allow-unauthenticated",
  "--profile",
  "--tools",
  "--dry-run",
  "--args",
  // init subcommand flags
  "--project",
  "--guild-id",
  "--token-env",
  "--channel",
  "--force",
  "--default",
]);

/**
 * Validates that every --flag in args is a recognised flag.
 * Stops scanning at a bare "--" separator.
 * Throws with a human-readable message on the first unknown flag.
 */
export function validateFlags(args: string[]): void {
  for (const arg of args) {
    if (arg === "--") break;
    if (arg.startsWith("--")) {
      if (!KNOWN_FLAGS.has(arg)) {
        throw new Error(`Unknown flag: ${arg}. Valid flags: ${[...KNOWN_FLAGS].join(", ")}`);
      }
    }
  }
}
