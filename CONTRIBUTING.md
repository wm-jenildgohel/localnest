# Contributing to LocalNest MCP

## Getting Started

```bash
git clone https://github.com/wm-jenildgohel/localnest.git
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

**Start the MCP server locally:**
```bash
npm start
```

**Install/update the bundled skill locally:**
```bash
npm run install:skill
```

## Project Structure

```
src/
  localnest-mcp.js              # MCP server entry point — tool registration
  config.js                     # Runtime config, env vars, defaults
  migrations/
    config-migrator.js          # Auto-migration for older config schemas
  services/
    workspace-service.js        # File discovery, tree, reads, project listing
    search-service.js           # Lexical + hybrid search orchestration
    vector-index-service.js     # JSON-backend semantic index
    sqlite-vec-index-service.js # sqlite-vec backend semantic index
scripts/
  setup-localnest.mjs           # Interactive setup CLI
  doctor-localnest.mjs          # Health check CLI
  install-localnest-skill.mjs   # Skill installer
skills/
  localnest-mcp/
    SKILL.md                    # Bundled agent skill (source of truth)
    agents/openai.yaml          # OpenAI/Codex agent interface config
```

## Making Changes

### Adding or modifying a tool

Tools are registered in `src/localnest-mcp.js` using `registerJsonTool`. Each tool needs:
- A canonical name (`localnest_*`) and optional short alias
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
- `SqliteVecIndexService` (`sqlite-vec-index-service.js`) — sqlite-vec backend, requires Node 22+

The server auto-falls back to JSON if sqlite-vec is unavailable. Both implement the same interface.

## Pull Request Guidelines

- Keep PRs focused — one concern per PR
- Run `npm run check` and `npm test` before opening a PR
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
