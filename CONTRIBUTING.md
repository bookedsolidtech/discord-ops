# Contributing to discord-ops

Thank you for your interest in contributing to discord-ops!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone git@github.com:YOUR_USERNAME/discord-ops.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feat/your-feature`

## Development

```bash
npm run dev          # Run with tsx (hot reload)
npm run build        # Compile TypeScript
npm run test         # Run tests
npm run lint         # Lint
npm run typecheck    # Type check
npm run format       # Format with Prettier
```

## Adding a Tool

1. Create a file in `src/tools/<category>/your-tool.ts`
2. Export a `ToolDefinition` object with Zod schema and handler
3. Re-export from the category's `index.ts`
4. Import and add to `allTools` in `src/tools/index.ts`
5. Add tests in `test/tools/`

## Pull Requests

- Use [Changesets](https://github.com/changesets/changesets) for version management: `npx changeset`
- Ensure `npm run lint && npm run typecheck && npm test` pass
- Write tests for new tools
- Keep PRs focused — one feature or fix per PR

## Commit Messages

Use conventional commits:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `test:` tests
- `chore:` maintenance

## Code Style

- TypeScript strict mode
- Prettier for formatting
- ESLint for linting
- Zod for all input validation
