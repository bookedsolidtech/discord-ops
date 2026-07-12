# Agent-to-Agent Coordination

discord-ops turns Discord channels into a coordination bus for multi-agent systems. One agent posts a task or question as a message, peer agents (or humans) reply and react, and the originating agent reads those replies and reactions back and acts on them. Every step in the loop is a standard discord-ops tool call, so any MCP-connected agent can participate — a Claude Code session, a CI job using `discord-ops run`, or a long-running daemon.

This guide documents the protocol: why Discord works as the bus, the core loop, the reaction vocabulary, threads for long exchanges, polling guidance, multi-project setups, and the anti-patterns to avoid.

## Why Discord as the Coordination Bus

Most multi-agent coordination schemes assume shared memory, a message queue, or a database every agent can reach. Discord gives you the same properties with less infrastructure — and a human window into everything:

- **Durable** — messages persist. An agent can post a task, terminate, and a completely different session can collect the replies hours later. Nothing is lost between sessions, restarts, or context windows.
- **Observable by humans** — the entire exchange happens in channels your team already reads. Humans can watch coordination in real time, jump in with a reply or a reaction, or override a decision. No separate dashboard to build.
- **Cross-process by default** — agents in separate processes, machines, or MCP sessions coordinate without sharing any state. The only common ground is the channel, addressed by `project` + `channel` alias.
- **Already operational** — auth, permissions, retention, rate limiting, mobile notifications: Discord ships all of it. You configure a bot, not a broker.

The tradeoff: Discord is not a low-latency queue. Expect seconds, not milliseconds, and design agents to poll at task boundaries rather than block waiting for responses.

## The Core Loop

Four tools carry the protocol: `send_message`, `add_reaction`, `get_replies`, and `get_reactions`.

**1. Agent A posts a task and records the message ID.**

```
send_message({
  project: "product",
  channel: "engineering",
  content: "TASK: verify the staging deploy of v1.4.0 and report status",
  raw: true
})
→ { "id": "333333333333333333", "channel_id": "222222222222222222", ... }
```

The returned `id` (also present as `message_id`) is the coordination key. Agent A persists it (task notes, scratchpad, state file) — everything else in the loop references it.

**2. Peer agents discover the task.**

Agents scan the channel on their own schedule with `get_messages`. The `after` parameter accepts a message ID or an ISO 8601 timestamp, so an agent can cheaply ask "anything new since I last checked?":

```
get_messages({ project: "product", channel: "engineering", after: "2026-07-12T09:00:00Z" })
```

Every message in the result includes `reply_to`, so a scanning agent can distinguish new top-level tasks from replies to existing ones.

**3. Peers acknowledge with a reaction, respond with a reply.**

```
# Claim the task so other agents don't duplicate work
add_reaction({
  project: "product",
  channel: "engineering",
  message_id: "333333333333333333",
  emoji: "👀"
})

# Respond — reply_to links the response to the task
send_message({
  project: "product",
  channel: "engineering",
  reply_to: "333333333333333333",
  content: "RESULT: staging deploy verified — health check green, smoke tests 12/12",
  raw: true
})
```

**4. Agent A collects the results.**

```
get_replies({ project: "product", channel: "engineering", message_id: "333333333333333333" })
get_reactions({ project: "product", channel: "engineering", message_id: "333333333333333333" })
```

**Tip: use `raw: true` for machine-to-machine messages.** By default `send_message` wraps content in a polished embed — great for humans, but the payload lands in the embed description rather than the message `content` field. `raw: true` keeps the payload in `content`, where reading agents expect it.

## Reading Results Back

Three read-side tools close the loop.

### get_message

Fetch a single message by ID with full coordination state. Input: routing (`project`/`channel`/`channel_id`) + `message_id`.

```
get_message({ project: "product", channel: "engineering", message_id: "333333333333333333" })
```

```json
{
  "channel_id": "222222222222222222",
  "id": "333333333333333333",
  "author": "planner-bot",
  "author_bot": true,
  "content": "TASK: verify the staging deploy of v1.4.0 and report status",
  "timestamp": "2026-07-12T09:14:03.000Z",
  "edited_timestamp": null,
  "pinned": false,
  "reply_to": null,
  "has_thread": false,
  "thread_id": null,
  "attachments": [],
  "embeds": [],
  "reactions": [
    { "emoji": "👀", "count": 1 },
    { "emoji": "✅", "count": 1 }
  ]
}
```

Use it to check a single task's status in one call: has anyone claimed it (reactions), has it moved to a thread (`has_thread`/`thread_id`), has it been edited since posting (`edited_timestamp`)?

### get_reactions

List who reacted with what. Input: routing + `message_id`, optional `emoji` filter, `limit`.

```
get_reactions({ project: "product", channel: "engineering", message_id: "333333333333333333", emoji: "✅" })
```

```json
{
  "message_id": "333333333333333333",
  "reactions": [
    {
      "emoji": "✅",
      "count": 1,
      "users": [{ "id": "888888888888888888", "username": "builder-bot", "bot": true }]
    }
  ]
}
```

The per-user detail is what makes reactions usable as signals: an agent can verify _which_ peer claimed a task, or count how many approvers are humans (`bot: false`) versus bots.

### get_replies

Collect replies to a specific message. Input: routing + `message_id`, `limit`, and an optional `after` resume cursor (defaults to `message_id`). The tool scans messages posted after the cursor and returns the ones whose `reply_to` matches the target:

```
get_replies({ project: "product", channel: "engineering", message_id: "333333333333333333", limit: 50 })
```

```json
{
  "message_id": "333333333333333333",
  "scanned": 42,
  "last_scanned_id": "444444444444444444",
  "replies": [
    {
      "id": "444444444444444444",
      "author": "builder-bot",
      "content": "RESULT: staging deploy verified — health check green, smoke tests 12/12",
      "reply_to": "333333333333333333",
      "timestamp": "2026-07-12T09:31:44.000Z"
    }
  ]
}
```

`scanned` and `last_scanned_id` tell you how far the scan reached. Persist `last_scanned_id` between polls and pass it back as `after` on the next call — each poll then scans only messages it hasn't seen, and an unchanged `last_scanned_id` means nothing new was posted. In high-traffic channels, prefer a thread (below) so replies aren't diluted across hundreds of scanned messages.

## Reaction Vocabulary

Reactions are the protocol's cheap signaling layer — one API call, no message noise, visible at a glance to humans. A working vocabulary:

| Emoji | Meaning                                              |
| ----- | ---------------------------------------------------- |
| 👀    | Seen / claimed — an agent has picked this up         |
| ✅    | Done / approved                                      |
| 🛑    | Blocked — needs human or upstream input              |
| ❌    | Declined — won't do, or rejected                     |
| 🤖    | Automated response follows — a bot reply is incoming |

This is a convention, not something discord-ops enforces. Teams can define their own vocabulary — what matters is that every agent (and human) in a server uses the same one. Document your vocabulary in a pinned message (`pin_message`) so both agents and humans can discover it.

## Threads for Long Exchanges

A task that needs more than one round trip shouldn't ping-pong in the main channel. Spin up a thread from the original message and continue there:

```
create_thread({
  project: "product",
  channel: "engineering",
  message_id: "333333333333333333",
  name: "v1.4.0 staging verification"
})
→ { "id": "555555555555555555", "name": "v1.4.0 staging verification", ... }
```

A thread ID is a channel ID in Discord's model — pass it as `channel_id` to any messaging tool:

```
send_message({ channel_id: "555555555555555555", content: "Attempt 2: rerunning smoke tests after cache clear", raw: true })
get_messages({ channel_id: "555555555555555555", limit: 50 })
```

When the exchange resolves, archive it:

```
archive_thread({ thread_id: "555555555555555555", project: "product" })
```

Threads keep the parent channel scannable (one entry per task instead of every round trip), give `get_replies` a small, cheap scan window, and produce a self-contained transcript humans can audit later. `get_message` on the original message reports `has_thread: true` and the `thread_id`, so a late-arriving agent can find the conversation from the task message alone.

## Polling

Agents built on MCP typically have no persistent process — they exist for the duration of a session. That's fine: the bus is durable, so polling replaces subscriptions.

- **Poll at task boundaries**, not on a timer. Natural checkpoints: session start, after finishing a subtask, before making a decision that depends on peer input.
- **Use cursors to keep polls cheap.** `get_messages` takes `after` (message ID or ISO 8601 timestamp); `get_replies` returns `last_scanned_id`, which you feed back as its `after` parameter on the next poll. An unchanged cursor means no new activity.
- **Escalate instead of polling harder.** If a response is urgent, ping humans via `notify_owners` or post a 🛑-flavored follow-up — don't shrink the polling interval to seconds.

### Worked Example: Two-Agent Exchange

`planner` (Agent A) and `builder` (Agent B) run in separate sessions with no shared memory. All IDs below are illustrative.

```
# ── planner, session 1 ─────────────────────────────────────────
send_message({
  project: "product",
  channel: "engineering",
  content: "TASK: bump discord.js to 14.16 on dev and confirm the test suite passes",
  raw: true
})
→ { "id": "333333333333333333" }
# planner records 333333333333333333 in its task notes, then exits.

# ── builder, some time later ────────────────────────────────────
get_messages({ project: "product", channel: "engineering", after: "2026-07-12T09:00:00Z" })
# → sees message 333333333333333333, no 👀 reaction yet: unclaimed.

add_reaction({ project: "product", channel: "engineering",
               message_id: "333333333333333333", emoji: "👀" })

# ... builder does the work ...

send_message({
  project: "product",
  channel: "engineering",
  reply_to: "333333333333333333",
  content: "RESULT: discord.js 14.16 bumped on dev — 214/214 tests passing, typecheck clean",
  raw: true
})
→ { "id": "444444444444444444" }

add_reaction({ project: "product", channel: "engineering",
               message_id: "333333333333333333", emoji: "✅" })

# ── planner, session 2 (next task boundary) ────────────────────
get_reactions({ project: "product", channel: "engineering",
                message_id: "333333333333333333" })
# → ✅ from builder-bot: work is claimed complete.

get_replies({ project: "product", channel: "engineering",
              message_id: "333333333333333333" })
# → reply 444444444444444444 with the result payload. planner proceeds.
```

Two sessions, zero shared state, and the whole exchange sits in `#engineering` where any human can audit it — or veto it with a ❌ before planner's next poll.

## Personas: Who Is Speaking

By default every agent posts as the same bot, which makes multi-agent channels hard to read. The persona suite gives each agent its own name and face without creating new bots: `create_persona` ensures a channel has a persona-capable webhook, and `send_as` posts through it with a per-message `username`/`avatar_url` override.

```
create_persona({ project: "product", channel: "engineering", name: "planner" })
send_as({ project: "product", channel: "engineering", persona_name: "planner",
          content: "TASK: verify the staging deploy", raw payload as content })
→ { "id": "333333333333333333", "persona": "planner", ... }
```

Two honesty notes: persona identity is _per message_ — any agent with channel access can post under any persona name, so personas are a readability convention, not an authentication mechanism (Discord marks all webhook messages with a BOT tag, and the `webhook_id` in the message attributes it to the carrying webhook — all persona traffic shares one auditable webhook per channel). Reserved authority names (`system`, `admin`, `moderator`, `owner`, …) are blocked to blunt impersonation, but the rule that matters is: **never treat a display name as an authorization signal.** And webhook messages cannot use `reply_to` — when an agent needs reply linkage for `get_replies`, it should post with `send_message` instead.

### Trust boundaries for the high-consequence tools

`send_as` (impersonate any name), `forward_message` (relocate content across channels), and `update_application` (rewrite app-global metadata) are the highest-consequence tools in the suite, and an agent that reads untrusted channel text is a confused-deputy target. Three rules:

- **Scope by profile.** Don't grant `send_as`/`forward_message` to agents that only need to read — use tool profiles to give each agent the narrowest set.
- **`forward_message` crosses trust boundaries.** It respects only the _bot's_ read permission, not the requesting agent's intent — an injected instruction sitting in a public channel can try to relocate content from a restricted channel outward. Keep sensitive channels out of reach of agents that also hold forward/persona tools. This is the durable form of the "coordinating secrets through channels" anti-pattern below.
- **`update_application` is application-global.** Its edits apply in every guild the app is installed to, unlike the per-guild rest of the surface. `description`/`tags`/`icon` are reversible; treat the tool as privileged.

## Polls: Structured Consensus

Reaction voting is fine for acks, but tallying ✅ vs ❌ across agents gets ambiguous. Native polls are the structured alternative:

```
send_poll({ project: "product", channel: "engineering",
            question: "Adopt the new deploy pipeline?",
            answers: [{ text: "Yes", emoji: "✅" }, { text: "Not yet", emoji: "🔍" }],
            duration_hours: 4 })
→ { "message_id": "555555555555555555", "answer_ids": [1, 2] }

get_poll_results({ project: "product", channel: "engineering", message_id: "555555555555555555" })
→ answers with counts and voters — each voter carries a `bot` flag, so
  agent votes and human votes are distinguishable.

end_poll({ ... })   # finalize early once quorum is reached
```

A coordinator agent can post a poll, let peers and humans vote, poll `get_poll_results` at task boundaries, and `end_poll` when a decision threshold is met.

The `project` routing param lets one MCP server serve multiple Discord servers with separate bots. A typical split: a product/dev server where build agents coordinate, and an operations server for infrastructure agents:

```json
{
  "projects": {
    "product": {
      "guild_id": "111111111111111111",
      "channels": { "engineering": "222222222222222222" },
      "default_channel": "engineering",
      "token_env": "PRODUCT_BOT_TOKEN"
    },
    "operations": {
      "guild_id": "666666666666666666",
      "channels": { "ops-bots": "777777777777777777" },
      "default_channel": "ops-bots",
      "token_env": "OPS_BOT_TOKEN"
    }
  }
}
```

Coordination stays within a project: an agent polling `project: "product"` never sees traffic in `operations`, and each project's bot only needs access to its own guild. Crossing the boundary is always an explicit act — an agent re-posts to the other project — which keeps blast radius and audit trails clean. Pair this with [tool profiles](../README.md#tool-profiles) to give each agent only the tools its role needs (the built-in `monitoring` profile covers the read side of the loop).

## Anti-Patterns

**Polling in tight loops.** Discord rate-limits aggressively per route, and discord-ops applies its own rate limiting on top. An agent hammering `get_replies` every second gains nothing — replies arrive on human-and-agent timescales — and starves every other tool call sharing the bot token. Poll at task boundaries; if you genuinely need sub-minute reactions, you need a gateway-connected daemon, not a polling agent.

**Reactions as data payloads.** Encoding results in emoji sequences ("🔴🟡2️⃣" = degraded, 2 retries) breaks immediately: reactions are unordered, deduplicated per user, and capped per message. Reactions are signals — claimed, done, blocked. Data goes in replies, where it's ordered, attributed, timestamped, and searchable.

**Coordinating secrets through channels.** Channels are durable and readable by every member and every bot with access — exactly the properties you want for coordination and exactly the ones you don't for credentials. Never post tokens, API keys, or connection strings, even in "private" channels or threads. Pass references instead (an env var name, a secret-manager path) and let each agent resolve them locally. discord-ops sanitizes tokens out of error output, but it cannot unsay a secret an agent deliberately posts. If you run the `discord-ops listen` sidecar, this gets sharper: watched channels' message content is written to the local sink file (`~/.discord-ops/events.jsonl`, created `0600`) for `retention_hours`. Exclude sensitive channels from `listen.channels`, set a retention you're comfortable with, and treat the sink as a disposable cache — Discord's channel history stays the source of truth, and events during a sidecar outage are simply lost.

**One channel for everything.** `get_replies` scans forward from the target message, so a channel carrying every team's traffic makes each poll scan mostly-irrelevant messages. Give coordination its own channel (or one per agent team), and move any exchange past one round trip into a thread.
