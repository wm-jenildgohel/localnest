# Contributing to LocalNest MCP

## Getting Started

```bash
git clone https://github.com/wmt-mobile/localnest.git
cd localnest
npm install
npm run setup
npm run doctor
```

## Development

**Syntax check all source files:**
```bash
npm run check
```

**Run tests:**
```bash
npm test
```

**Run full code quality pipeline (lint, coverage, cycles, deps, package, audit):**
```bash
npm run quality
```

**Start the MCP server locally:**
```bash
npm start
```

**Install/update the bundled skill locally:**
```bash
npm run install:skill
```

## Project Structure

Contributor references:
- [`guides/repository-structure.md`](./guides/repository-structure.md)
- [`guides/architecture.md`](./guides/architecture.md)
- [`guides/code-standards.md`](./guides/code-standards.md)

## Making Changes

### Adding or modifying a tool

Tools are registered in `src/localnest-mcp.js` using `registerJsonTool`. Each tool needs:
- A canonical name (`localnest_*`)
- Zod input schema
- `readOnlyHint` / `destructiveHint` annotations
- Handler returning plain data (serialization is handled by `toolResult`)

### Updating the skill

The skill at `skills/localnest-mcp/SKILL.md` is the source of truth. After editing it, sync to the installed location:
```bash
npm run install:skill
```

Or manually:
```bash
cp skills/localnest-mcp/SKILL.md ~/.agents/skills/localnest-mcp/SKILL.md
```

### Index backends

- `VectorIndexService` (`vector-index-service.js`) — JSON backend, works on all Node versions
- `SqliteVecIndexService` (`sqlite-vec-index-service.js`) — sqlite-vec backend, requires Node 22+; uses `term_index` inverted index for fast semantic lookup

The server auto-falls back to JSON if sqlite-vec is unavailable. Both implement the same interface and share the tokenizer from `services/tokenizer.js`.

Changing the tokenizer requires a `SCHEMA_VERSION` bump in `sqlite-vec-index-service.js` and a corresponding `_runMigrations()` branch that clears stale index data.

## Pull Request Guidelines

- Keep PRs focused — one concern per PR
- Run `npm run quality` before opening a PR
- Update `skills/localnest-mcp/SKILL.md` if you add or change any tool
- Do not bump the version — maintainers handle releases

## Reporting Issues

Open an issue with:
- Node.js version (`node --version`)
- Platform (macOS/Linux/Windows)
- Output of `localnest-mcp-doctor`
- Steps to reproduce

## Publishing (Maintainers Only)

**Beta release:**
```bash
npm run check
npm test
npm run release:beta
```

**Stable release:**
```bash
npm run check
npm test
npm run release:latest
```

**Dry-run pack validation:**
```bash
npm pack --dry-run
```

**Version bump (beta pre-release):**
```bash
npm run bump:beta
```
