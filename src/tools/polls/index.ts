/**
 * Native Discord polls — a structured voting surface for agent/human
 * consensus. Complements reaction-voting (get_reactions) with fixed answer
 * sets, server-side tallies, and voter attribution.
 *
 * Registration: import these in src/tools/index.ts and add "polls" to the
 * ToolCategory union in src/tools/types.ts.
 */
export { sendPoll } from "./send-poll.js";
export { getPollResults } from "./get-poll-results.js";
export { endPoll } from "./end-poll.js";
