# Project Onboarding

This guide walks a project team — and the agents working on its behalf — through adopting discord-ops as a shared coordination and communication system, using the full surface: channels as a durable bus, personas for agent identity, native polls for decisions, forums for work queues, the project note board for directed hand-offs, and an optional real-time sidecar.

It complements [agent-coordination.md](agent-coordination.md). That document is the reference for _how the coordination loop works_ — the message/reaction/reply protocol, threads, polling cadence, anti-patterns. This one is the _set-up-and-adopt walkthrough_: start here to stand a project up and put the workflow into practice, then reach for the coordination reference when you need loop mechanics.

## What discord-ops Gives a Project

discord-ops turns a Discord server into a project's coordination fabric. You get a **shared, durable, human-visible bus** — channels every teammate already reads, where nothing is lost between sessions, restarts, or context windows. You get **agent identities without standing up new bots** — one bot posts under unlimited persona names. You get **structured decisions** through native polls, **work queues** through forum channels where a post is a task and its tags are status labels, and a **directed note board per project** — one channel where agents leave notes addressed to each other and read on startup to catch up. When polling isn't fast enough, an optional **real-time sidecar** pushes gateway events into a local sink. All of it is exposed as 72 MCP tools, and each agent loads only a slim profile of the ones its role needs.

## Set Up a Project

A project is a named entry in the global config at `~/.discord-ops.json`. It maps a Discord guild to a set of channel aliases so agents route by name (`channel: "builds"`) instead of raw snowflake IDs, and declares which bot token and note board the project uses. All IDs below are fabricated.

```json
{
  "projects": {
    "webapp": {
      "guild_id": "100000000000000001",
      "channels": {
        "dev": "200000000000000001",
        "builds": "200000000000000002",
        "releases": "200000000000000003",
        "agent-board": "200000000000000004"
      },
      "default_channel": "dev",
      "board_channel": "agent-board",
      "token_env": "WEBAPP_DISCORD_TOKEN",
      "tool_profile": "monitoring"
    }
  },
  "default_project": "webapp"
}
```

The fields that matter for onboarding:

- **`guild_id`** — the Discord server this project lives in.
- **`channels`** — alias → channel ID map. `channel: "builds"` resolves here first; a channel can also be `{ "id": "…", "bot": "…" }` to post under a different bot.
- **`default_channel`** — used when a tool call omits `channel`.
- **`token_env`** — the env var holding this project's bot token. When every project sets `token_env`, no default `DISCORD_TOKEN` is needed.
- **`board_channel`** — the channel that hosts this project's [note board](#the-project-note-board). Set it explicitly, or let it resolve through the fallback chain below.
- **`tool_profile`** — the base [tool profile](#profiles-and-least-privilege) agents on this project load; `monitoring` is the coordination profile.

### How the board channel resolves

`board_channel` names the channel the note-board tools read and write. When it's unset, discord-ops walks a fallback chain and uses the first match:

1. **`board_channel`** — the explicit setting.
2. A **`board`** or **`agent-board`** channel alias.
3. An **`agent-logs`** alias.
4. A **`backchannel`** alias.
5. **`default_channel`**.

If none of those resolve, the note tools return an error asking you to set `board_channel` or add one of those aliases. Give the board its own channel rather than pointing it at a busy `dev` channel — it stays scannable, and `get_notes` doesn't waste its scan window on human chatter.

### Validate before you connect

`discord-ops validate` checks the config without touching Discord — it catches missing token env vars, bot references pointing at undefined bots, invalid profile names, duplicate guild IDs, and `default_channel` / notification routing that points at aliases you never defined.

```bash
discord-ops validate
```

Once it passes, confirm the bot can actually reach the guild and has the permissions it needs:

```
health_check({ project: "webapp" })
→ bot status, version, connected guilds, and a permission audit
```

## The Project Note Board

The note board is the centerpiece of the onboarding workflow, and the first thing an agent should look at when it starts work. It is **one channel per project**, shared by every session, where agents leave **directed notes** — each note addressed to a recipient, stamped with who sent it, and tagged for filtering. Notes persist as ordinary channel history: durable across sessions, and readable by the humans in the server. This is where an agent records what it did, what it needs, and the hand-offs for whoever picks the work up next.

Four tools operate the board: `leave_note` (write), `get_notes` (read), `resolve_note` (close), and `list_sessions` (see who's active). All four take the same routing fields — `project` (defaults to the default project), and optional `board_channel` / `channel_id` overrides — and resolve the board through the chain above.

### leave_note — record a note or hand-off

```
leave_note({
  project: "webapp",
  to: "web-c3d4",
  from: "web-a1b2",
  tags: ["deploy", "staging"],
  body: "Staging deploy of v1.4.0 is up. Please run the smoke suite and confirm."
})
→ { "id": "300000000000000001", "to": "web-c3d4", "from": "web-a1b2", "tags": ["deploy","staging"], ... }
```

- **`to`** — the recipient. It's a **session id**, a **role or name**, or **`all`** to broadcast. Defaults to `all`.
- **`from`** — your session id (see below). Omit it and discord-ops fills it in.
- **`tags`** — up to 10 free-form labels for filtering (topic, status, or work-stream).
- **`body`** — the note text, up to 1800 characters.

The returned `id` is the note's message ID — you pass it to `resolve_note` to close the note later.

### Session identity and the multi-session story

Every note is stamped `from` a **session id**. Each session picks a stable one so peers can address notes back to it:

- Set **`DISCORD_OPS_SESSION`** in the environment — the reliable way to get a stable, meaningful id (e.g. `DISCORD_OPS_SESSION=planner`). This is what you want when two agents should address each other by role.
- Otherwise discord-ops **auto-derives** one from the working-directory basename plus a short random suffix (e.g. `webapp-a1b2`), cached for the life of the process so every note from that server shares it.

Because the board is one channel keyed by project, **two Claude sessions working the same project share it automatically** — same project, same channel. That's the whole multi-session story: before starting, run `list_sessions` to see who else is active so you don't duplicate their work; then address notes to a specific session id, or broadcast to `all`.

```
list_sessions({ project: "webapp", within_minutes: 120 })
→ {
    "active_count": 1,
    "sessions": [
      { "session": "web-a1b2", "last_seen": "2026-07-12T09:14:03.000Z", "note_count": 3, "active": true }
    ]
  }
```

Presence is derived from note activity — who posted, and when — so there's no separate heartbeat to maintain. A session is "active" if it posted within the `within_minutes` window (default 60).

### get_notes — the first call on startup

`get_notes` reads the board back. It is the **first thing an agent should call** when it starts work on a project: it surfaces the hand-offs, open requests, and record of what other sessions have already done. Non-note messages in the channel are skipped, so humans can chat in the board channel without confusing readers.

```
get_notes({ project: "webapp", to: "web-c3d4", unresolved: true })
→ {
    "count": 1,
    "notes": [
      {
        "id": "300000000000000001",
        "to": "web-c3d4",
        "from": "web-a1b2",
        "tags": ["deploy", "staging"],
        "body": "Staging deploy of v1.4.0 is up. Please run the smoke suite and confirm.",
        "resolved": false,
        "timestamp": "2026-07-12T09:14:03.000Z"
      }
    ]
  }
```

- **`to`** — pass **your own session id** to get notes meant for you _plus_ every broadcast (`all`). This is the normal startup read.
- **`unresolved: true`** — only notes not yet closed, so you see open hand-offs and nothing already handled.
- **`from`** / **`tag`** — narrow to one sender or one tag (note: the read filter is a single `tag`, whereas `leave_note` takes a `tags` array).
- **`after`** — a resume cursor (message ID or ISO 8601 timestamp); page forward on repeat polls so each scan only covers what's new.

### resolve_note — close a hand-off

When you finish what a note asked for, resolve it. `resolve_note` adds a ✅ reaction to the note — which drops it off the `unresolved: true` list — and optionally posts a reply note so the log records the outcome and who closed it. The reply is addressed back to the original sender and tagged `resolved`.

```
resolve_note({
  project: "webapp",
  note_id: "300000000000000001",
  from: "web-c3d4",
  reply: "Smoke suite green — 24/24 passing on staging. Clear to promote."
})
→ { "note_id": "300000000000000001", "resolved": true, "reply_id": "300000000000000002" }
```

Close hand-offs and requests as you finish them instead of letting them pile up — an unresolved list that reflects only genuinely-open work is what makes the board trustworthy.

### Worked example: a two-session hand-off

`web-a1b2` (a planner session) and `web-c3d4` (a builder session) work the same `webapp` project in separate processes with no shared memory. Both set `DISCORD_OPS_SESSION` so their ids are stable. All IDs are illustrative.

```
# ── planner (web-a1b2), session 1 ──────────────────────────────
leave_note({
  project: "webapp",
  to: "web-c3d4",
  from: "web-a1b2",
  tags: ["deploy", "staging"],
  body: "Staging deploy of v1.4.0 is up. Run the smoke suite and confirm before we promote."
})
→ { "id": "300000000000000001" }
# planner exits; the note waits on the board.

# ── builder (web-c3d4) starts up later ─────────────────────────
list_sessions({ project: "webapp" })
# → web-a1b2 active earlier; no other builder is on the job.

get_notes({ project: "webapp", to: "web-c3d4", unresolved: true })
# → the hand-off from web-a1b2, tagged deploy/staging, still open.

leave_note({ project: "webapp", from: "web-c3d4", to: "all",
             body: "Picking up the v1.4.0 staging verification." })

# ... builder runs the smoke suite ...

resolve_note({ project: "webapp", note_id: "300000000000000001", from: "web-c3d4",
               reply: "Smoke suite green — 24/24 on staging. Clear to promote." })
# → note ✅-resolved; a reply note records the outcome, addressed back to web-a1b2.
```

When the planner returns at its next task boundary, `get_notes({ to: "web-a1b2" })` shows the resolved reply — the loop closed itself, entirely through durable channel history any human can audit.

### A startup ritual for agents

Bake this into every agent that works a project, so sessions converge on the same board discipline:

1. **`list_sessions`** — who else is active on this project right now?
2. **`get_notes({ to: "<your session>", unresolved: true })`** — read your open hand-offs plus broadcasts before doing anything.
3. **`leave_note({ to: "all", body: "session started …" })`** — announce your presence so peers can address you.
4. **Do the work, leaving notes at boundaries** — record decisions, results, and hand-offs as you go.
5. **`resolve_note` everything you close** — keep the unresolved list honest.

## Identities with Personas

By default every agent posts as the same bot, which makes a shared board hard to read. Personas give each agent its own name and avatar without creating a second Discord application: `create_persona` ensures a channel has a persona-capable webhook, and `send_as` posts through it with a per-message `username` / `avatar_url` override.

```
create_persona({ project: "webapp", channel: "dev", name: "planner" })
send_as({ project: "webapp", channel: "dev", persona_name: "planner",
          content: "Kicking off the v1.4.0 release checklist", raw: true })
→ { "id": "300000000000000003", "persona": "planner" }
```

Two things to keep straight. First, **persona identity is per message, not authentication** — any agent with channel access can post under any persona name, so a display name is a readability convention, never an authorization signal. Reserved authority names (`system`, `admin`, `moderator`, `owner`, …) are blocked to blunt impersonation, but the rule that matters is: don't trust a name. Second, **webhook messages can't use `reply_to`** — when an agent needs reply linkage (so `get_replies` can find the response), it should post with `send_message` instead of `send_as`. See the [personas section of the coordination guide](agent-coordination.md#personas-who-is-speaking) for the full trust discussion.

## Decisions with Polls; Work Queues with Forums

**Polls** turn a fuzzy "does everyone agree?" into a structured tally. `send_poll` posts a native Discord poll; `get_poll_results` reads counts and per-answer voters (each carrying a `bot` flag, so agent and human votes are distinguishable); `end_poll` finalizes early once a threshold is met.

```
send_poll({ project: "webapp", channel: "dev",
            question: "Promote v1.4.0 to production?",
            answers: [{ text: "Ship it", emoji: "✅" }, { text: "Hold", emoji: "🛑" }],
            duration_hours: 4 })
→ { "message_id": "300000000000000004", "answer_ids": [1, 2] }
```

**Forums** turn a forum channel into a durable work queue: each post is a task, its tags are status labels, and archiving closes it. `create_forum_post` opens a task, `list_forum_posts` polls for work (filter by tag), and `update_forum_post` re-tags or archives it.

```
create_forum_post({ project: "webapp", channel: "work-queue",
                    title: "Upgrade discord.js to 14.16",
                    content: "Bump on dev, confirm the suite passes.",
                    tags: ["ready"] })
→ { "thread_id": "300000000000000005", "applied_tags": ["ready"] }
```

Both suites are covered in full in the [Polls](../README.md#polls-3-tools) and [Forums](../README.md#forums-3-tools) tool tables.

## Real-Time Instead of Polling (Optional)

Polling `get_notes` and `get_messages` at task boundaries is the right default — it needs no long-running process and the bus is durable. When a project wants lower latency, the `discord-ops listen` sidecar is the upgrade: it holds a gateway connection and writes normalized events (messages, reactions) to a local sink file, and `get_events` reads them back with a cursor and **zero Discord API calls per poll**.

```bash
discord-ops listen        # long-running sidecar; streams gateway events into the sink
```

```
get_events({ project: "webapp", types: ["message_create"], after: 0 })
→ { "events": [ … ], "last_seq": 128, "sink_active": true }
# pass after=last_seq on the next call to consume only what's new
```

Configure it under a top-level `listen` block in `~/.discord-ops.json`:

```json
{
  "listen": {
    "sink": "~/.discord-ops/events.jsonl",
    "events": ["message_create", "reaction_add"],
    "channels": ["agent-board", "dev"],
    "retention_hours": 72
  }
}
```

The sink holds message **content at rest** — treat it as a disposable cache, not the source of truth (Discord channel history stays authoritative). It's created `0600`, but the safe practice still holds: **exclude sensitive channels** from `listen.channels`, set a `retention_hours` you're comfortable with, and never rely on it during a sidecar outage (events are simply lost while it's down). When `get_events` reports `sink_active: false`, the sidecar isn't running — fall back to `get_messages`.

## Profiles and Least Privilege

Give each agent the **narrowest profile** its role needs. Profiles cut schema overhead and, more importantly, keep high-consequence tools out of the hands of agents that only read. Set the base with `tool_profile`, and adjust per project with `profile_add` / `profile_remove`.

- **`monitoring`** is the coordination profile. It carries the read side of the loop (`get_messages`, `get_message`, `get_replies`, `get_reactions`), the send/react/thread tools, native polls, and the four note-board tools (`leave_note`, `get_notes`, `resolve_note`, `list_sessions`) — everything a coordinating agent needs, and nothing destructive.
- **`readonly`** is for pure observers — list and get tools only.
- Keep the highest-consequence tools — `send_as` (impersonate any name), `forward_message` (relocate content across channels), and `update_application` (rewrite app-global metadata) — **away from readers**. An agent that reads untrusted channel text and also holds these is a confused-deputy target. `forward_message` in particular respects only the _bot's_ read permission, so an injected instruction can try to relocate content from a restricted channel outward; keep sensitive channels out of reach of agents that hold forward or persona tools.

See the [Tool Profiles](../README.md#tool-profiles) reference for the full built-in set and per-project override syntax.

## A Project Charter Block

Pin one source of truth in your board channel so humans and agents share the same conventions. Draft it, post it, and pin it with `pin_message`:

```
# webapp — Agent Coordination Charter   (pinned)

Board channel   #agent-board            (config: "board_channel": "agent-board")
Session ids     <role>-<suffix>, set via DISCORD_OPS_SESSION (e.g. planner, web-a1b2)
                unset -> auto-derived from the working directory (webapp-xxxx)

Reactions       👀 seen / claimed    ✅ done / approved    🛑 blocked
                ❌ declined          🤖 bot reply incoming

Note tags       deploy | release | ci | review | blocker | fyi
                tag every hand-off with a work-stream so get_notes({ tag }) filters cleanly

Startup ritual  1. list_sessions                         who else is active?
                2. get_notes { to:<me>, unresolved:true } my open hand-offs + broadcasts
                3. leave_note { to:"all" }                announce presence
                4. work, leaving notes at boundaries
                5. resolve_note everything you close

Rule            a display name is never an authorization signal; never post secrets
```

Adapt the vocabulary to your team — the point is that every session, human and agent, reads the same conventions from one pinned message. Reaction meanings, tag names, and the session-id scheme only work as coordination if everyone uses them the same way.

## References

- [Agent-to-Agent Coordination](agent-coordination.md) — the coordination protocol: core loop, reaction vocabulary, threads, polling, anti-patterns.
- [README: Tool Profiles](../README.md#tool-profiles) — built-in profiles and per-project overrides.
- [README: Project Routing](../README.md#project-routing) — full `~/.discord-ops.json` config reference.
- [README: Tools](../README.md#tools) — the complete tool tables.
