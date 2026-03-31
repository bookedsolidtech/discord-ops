---
"discord-ops": minor
---

Cutting-edge template system upgrade — 23 templates with native Discord features

- **6 new templates**: dashboard (multi-embed status board), progress (visual bar), oncall (shift handoff), standup (daily summary), retro (sprint retrospective), alert (configurable levels)
- **Native Discord polls**: `poll` template now uses Discord's poll API with progress bars, vote tracking, multiselect, and duration (replaces emoji-based fallback)
- **Link buttons**: deploy (View Deployment + View Logs), incident (Status Page), review (Open PR), release (Release Notes + npm + Docs), oncall (Runbook), and more
- **Author branding**: every template supports `author_name` + `author_icon` for consistent identity at the top of embeds
- **Discord timestamps**: maintenance start/end, incident started_at, announcement deadlines, welcome start_date — all auto-convert to user's timezone with live countdowns
- **Footer status icons**: deploy, ci_build, incident, status_update show green/red indicator icons
- **Clickable titles**: release, deploy, review, changelog titles link directly to URLs
- **Multi-embed dashboards**: up to 10 embeds per message for service status boards
- **Syntax-highlighted code**: tip template supports `language` var for code block highlighting
- **Visual progress bars**: Unicode block progress indicator with percentage
- **Severity-based colors**: incident template colors vary by severity (critical/high/medium/low)
- **Webhook schema fix**: `execute_webhook` now supports thumbnail, image, author, footer.icon_url (was missing)
- **Changelog expansion**: deprecated and performance sections added
- 45 new template tests (255 total)
