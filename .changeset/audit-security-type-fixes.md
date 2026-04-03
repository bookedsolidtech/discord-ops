---
"discord-ops": minor
---

Comprehensive security, type safety, and correctness audit fixes (5-specialist review)

**Security**
- Fix shell injection in release workflow: use `execFileSync` argv array instead of shell string interpolation for Discord notification step
- Remove unused `id-token: write` permission from release workflow
- Guard `PUBLISHED_PACKAGES` JSON parse in CI notify script to prevent spurious workflow failures
- Inline `DISCORD_OPS_CONFIG` JSON now throws on malformed input instead of silently using empty config

**Correctness**
- `delete_channel`: use `getAnyChannel` so voice channels, categories, and forums can be deleted (was text-only)
- `archive_thread`: use `getAnyChannel` + `isThread()` guard instead of duck-typed `as any` cast
- `query_audit_log`: return error on unknown `action_type` instead of silently ignoring the filter
- `notify_owners`: return `isError: true` when project does not exist in config (was silent no-op)
- `move_channel`: add `requiresGuild: true` so `ManageChannels` permission pre-flight is enforced; use live channel fetch for sibling list to avoid stale-cache race; replace `.refine()` with `.superRefine()` with proper path reporting; use `ChannelType` allowlist instead of fragile duck-type thread guard
- `setup.ts`: add `"alert"` to wizard `NOTIFICATION_TYPES` list (was missing from enum)

**Type safety**
- `server.ts`: replace `(schema as any)._def` with `instanceof z.ZodObject`; move `getTokenForProject` to static import
- `purge_messages`: replace `as any` with `TextChannel` cast
- `set_slowmode`: replace `(updated as any).name` with runtime presence check
- `edit_channel`: replace `as unknown as TextChannel` double-cast with `GuildChannel`
- `create_webhook`: replace `as any` with `TextChannel` cast
- `get_webhook`: replace `(owner as any).tag` with `"tag" in` guard
- `query_audit_log`: replace `(entry.target as any).id` with `"id" in` guard
- `owners.ts`: replace `as never` cast with proper `NotificationType` parameter type; return `null` for project-not-found vs `""` for no-op

**Dead code removal**
- Delete empty `src/cli/health.ts` placeholder (referenced v0.1.0 in a v0.18+ package)
- Delete unused `src/utils/retry.ts` (exported but never imported)
- Remove dead `properties` array and `void` suppressor in `og-fetch.ts`
- Remove stale doc comment from `templates/registry.ts`
- Remove always-true ternary `STATUS_ICONS.success ? { icon_url: ... } : {}` in release template footer
- Remove unused `key` variable in `validate.ts` channel loop
- Remove unnecessary `[...result]` spread in `list-members.ts`
- Deduplicate `channel.threads.create` call in `create-thread.ts`

**Tests**
- Add `findChannelByName` mock to `createMockDiscordClient`
- Fix `notify-owners.test.ts`: type `notifyOn` as `NotificationType[]` (was `string[]`)
- Fix `archive-thread.test.ts`: use `getAnyChannel` + `isThread()` mock
- Fix `move-channel.test.ts`: use `createCtx` override instead of post-hoc mutation for cross-category test; update guild.channels.fetch mock to support no-args call
- Add test: `notify_owners` returns error for nonexistent project
- Update `query_audit_log` test: unknown `action_type` now returns error (was silent)
