# LocalNest MCP (Node.js)

LocalNest is a local-first MCP server that gives AI agents safe, read-only visibility into your codebase plus optional local semantic indexing for better retrieval quality.

## What This Tool Does

LocalNest is built for agent workflows on large repositories:
- Safe file discovery and bounded file reads under configured roots
- Fast lexical search (`rg`/ripgrep-backed)
- Optional semantic indexing (`sqlite-vec` or JSON backend)
- Hybrid retrieval (lexical + semantic fusion)
- Lightweight project introspection tools (roots, projects, tree, summaries)

Why this is useful:
- Reduces noisy context sent to agents
- Speeds up code navigation in mono-repos and multi-project workspaces
- Keeps data local (no external indexing service required)

## Requirements

- Node.js `>=18`
- `npm` / `npx`
- `ripgrep` (`rg`) required

Install `ripgrep`:
- Ubuntu/Debian: `sudo apt-get install ripgrep`
- macOS (Homebrew): `brew install ripgrep`
- Windows (winget): `winget install BurntSushi.ripgrep.MSVC`
- Windows (choco): `choco install ripgrep`

## Installation And Setup Flow

Recommended (stable): global install
```bash
npm install -g localnest-mcp
localnest-mcp-install-skill
localnest-mcp-setup
localnest-mcp-doctor
```

Fallback (use only if you cannot install globally): `npx`
```bash
npx -y localnest-mcp-setup
npx -y localnest-mcp-doctor
```

Why global is recommended:
- More deterministic dependency resolution
- Avoids transient `npx` cache/package extraction issues
- Better for repeatable team onboarding and CI-like local checks

1. Run setup:
```bash
localnest-mcp-setup
```

2. Run health check:
```bash
localnest-mcp-doctor
```

3. Copy `mcpServers.localnest` from `~/.localnest/mcp.localnest.json` into your MCP client config.

4. Restart your MCP client.

Setup writes:
- `~/.localnest/localnest.config.json`
- `~/.localnest/mcp.localnest.json`

During setup, choose index backend:
- `sqlite-vec` (recommended): persistent SQLite DB, efficient for large repos
- `json`: compatibility fallback

## Bundled Skill Distribution

LocalNest now ships with a bundled Codex skill: `localnest-mcp`.

Automatic install behavior:
- On package install, LocalNest attempts to auto-install the bundled skill to `~/.agents/skills/localnest-mcp`.
- In CI environments (`CI=true`), auto-install is skipped.

Manual skill install/update command:
```bash
localnest-mcp-install-skill
```

Optional flags/env:
- Force reinstall: `localnest-mcp-install-skill --force`
- Skip auto-install on package install:
```bash
LOCALNEST_SKIP_SKILL_INSTALL=true npm install -g localnest-mcp
```

## MCP Config Example

```json
{
  "mcpServers": {
    "localnest": {
      "command": "npx",
      "args": ["-y", "localnest-mcp"],
      "env": {
        "MCP_MODE": "stdio",
        "LOCALNEST_CONFIG": "/Users/you/.localnest/localnest.config.json",
        "LOCALNEST_INDEX_BACKEND": "sqlite-vec",
        "LOCALNEST_DB_PATH": "/Users/you/.localnest/localnest.db",
        "LOCALNEST_INDEX_PATH": "/Users/you/.localnest/localnest.index.json"
      }
    }
  }
}
```

Windows note:
- Setup auto-generates `npx.cmd` in `mcp.localnest.json`.

## Recommended Usage Flow

1. `localnest_server_status`
2. `localnest_list_roots`
3. `localnest_list_projects`
4. `localnest_index_status`
5. `localnest_index_project`
6. `localnest_search_hybrid`
7. `localnest_read_file`

Compatibility aliases without `localnest_` prefix are still supported.

## Tools Exposed

Canonical names:
- `localnest_server_status`
- `localnest_usage_guide`
- `localnest_list_roots`
- `localnest_list_projects`
- `localnest_project_tree`
- `localnest_search_code`
- `localnest_search_hybrid`
- `localnest_read_file`
- `localnest_summarize_project`
- `localnest_index_status`
- `localnest_index_project`

All tools support:
- `response_format`: `json` (default) or `markdown`

List-style tools return pagination metadata:
- `total_count`, `count`, `limit`, `offset`, `has_more`, `next_offset`, `items`

## Local Development Flow

```bash
npm install
npm run setup
npm run doctor
npm run check
npm test
npm start
```

## Config Priority

1. `PROJECT_ROOTS` environment variable
2. `LOCALNEST_CONFIG` file
3. Current working directory fallback

## Vector Index Settings

Optional env vars:
- `LOCALNEST_INDEX_BACKEND` (`sqlite-vec` or `json`, default: `sqlite-vec`)
- `LOCALNEST_DB_PATH` (default: `~/.localnest/localnest.db`)
- `LOCALNEST_INDEX_PATH` (default: `~/.localnest/localnest.index.json`)
- `LOCALNEST_SQLITE_VEC_EXTENSION` (optional extension path)
- `LOCALNEST_VECTOR_CHUNK_LINES` (default: `60`)
- `LOCALNEST_VECTOR_CHUNK_OVERLAP` (default: `15`)
- `LOCALNEST_VECTOR_MAX_TERMS` (default: `80`)
- `LOCALNEST_VECTOR_MAX_FILES` (default: `20000`)

Runtime note:
- `sqlite-vec` requires `node:sqlite` support (Node 22+).
- Older runtimes automatically fall back to JSON backend.

## Auto Upgrade Behavior

On startup, LocalNest auto-migrates older config schemas:
- Non-destructive backup: `localnest.config.json.bak.<timestamp>`
- Missing index settings are filled automatically
- No manual setup rerun needed for normal upgrades

## Main Issue We Faced (And Fix)

During implementation and validation, the key blocking issue was:
- `ERR_MODULE_NOT_FOUND` for `@modelcontextprotocol/sdk` during `doctor`

Root cause:
- Partial/corrupt dependency state (`node_modules/@modelcontextprotocol/sdk` missing package contents)

Fix:
- Reinstall dependencies (`npm install`), then rerun doctor/check

Additional runtime hardening done:
- SQLite transaction handling was updated to explicit `BEGIN/COMMIT/ROLLBACK` for broader Node `node:sqlite` compatibility.

## Publish

Beta:
```bash
npm login
npm run check
npm test
npm run release:beta
```

Stable:
```bash
npm run release:latest
```

Pack validation:
```bash
npm pack --dry-run
```
