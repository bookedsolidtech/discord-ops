# discord-ops

A Model Context Protocol (MCP) server that exposes Discord bot operations as tools for AI agents. Published as [`@bookedstudios/discord-ops`](https://www.npmjs.com/package/@bookedstudios/discord-ops) on npm.

## Package manager

Use **npm** (not pnpm or yarn).

## Key commands

```bash
npm test              # run vitest test suite
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run build         # compile to dist/
```

## Branch strategy

`dev` → `staging` → `main`

- Feature work on `dev` or feature branches
- `staging` for release candidates
- `main` is the published release branch — merges trigger npm publish via changesets

