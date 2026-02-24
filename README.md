# LocalNest MCP (Node.js)

LocalNest is a local, read-only MCP server that lets AI tools inspect code in your selected project roots.

## Requirements

- Node.js `>=18`
- `npm` / `npx`
- `ripgrep` (`rg`) required

Install `ripgrep`:
- Ubuntu/Debian: `sudo apt-get install ripgrep`
- macOS (Homebrew): `brew install ripgrep`
- Windows (winget): `winget install BurntSushi.ripgrep.MSVC`
- Windows (choco): `choco install ripgrep`

## Why `rg` Is Required

`localnest-mcp` is optimized for large multi-project workspaces. `ripgrep` is required because:
- `search_code` depends on `rg` for fast indexed line search across many folders.
- Without `rg`, search becomes significantly slower and less reliable for large repositories.
- The server and setup intentionally fail fast when `rg` is missing, so users get explicit setup errors instead of degraded behavior.

## Quick Start (No Global Install)

1. Run setup:
```bash
npx -y localnest-mcp-setup
```

2. Run doctor:
```bash
npx -y localnest-mcp-doctor
```

3. Copy `mcpServers.localnest` from `~/.localnest/mcp.localnest.json` into your MCP client config.

4. Restart your MCP client.

Setup writes:
- `~/.localnest/localnest.config.json`
- `~/.localnest/mcp.localnest.json`

Setup now also asks once for indexing backend:
- `sqlite-vec` (recommended): persistent SQLite DB, low-resource, upgrade-friendly
- `json`: compatibility fallback index file

## Auto Upgrade Behavior

After package upgrade, LocalNest auto-migrates existing `LOCALNEST_CONFIG` on startup.
- Non-destructive migration with automatic backup:
  - `localnest.config.json.bak.<timestamp>`
- Adds missing index settings and upgrades schema version when required.
- No manual setup rerun required for normal upgrades.

## Local Dev (This Repo)

```bash
npm install
npm run setup
npm run doctor
npm start
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
- setup auto-generates `npx.cmd` in `mcp.localnest.json`.

## Commands

- `localnest-mcp`: starts MCP server via stdio
- `localnest-mcp-setup`: interactive root setup
- `localnest-mcp-doctor`: validates environment/config

From repo:
- `npm run setup`
- `npm run doctor`
- `npm run check`

## Publish

Beta:
```bash
npm login
npm run check
npm run release:beta
```

Stable:
```bash
npm run release:latest
```

Pack test:
```bash
npm pack --dry-run
```

## Config Priority

1. `PROJECT_ROOTS` env var
2. `LOCALNEST_CONFIG` file
3. current working directory fallback

## Vector Index (Phase 1)

LocalNest now supports a local semantic index to reduce noisy results and return smaller, more relevant context.

New MCP tools:
- `index_status`
- `index_project`
- `search_hybrid`

Recommended flow:
1. `index_project` for your target project/root.
2. `search_hybrid` for retrieval.
3. `read_file` on top fused results only.

Optional env vars:
- `LOCALNEST_INDEX_BACKEND` (`sqlite-vec` or `json`, default: `sqlite-vec`)
- `LOCALNEST_DB_PATH` (default: `~/.localnest/localnest.db`)
- `LOCALNEST_INDEX_PATH` (default: `~/.localnest/localnest.index.json`, used by `json` backend and as fallback)
- `LOCALNEST_SQLITE_VEC_EXTENSION` (optional extension path if you want to explicitly load sqlite-vec extension)
- `LOCALNEST_VECTOR_CHUNK_LINES` (default: `60`)
- `LOCALNEST_VECTOR_CHUNK_OVERLAP` (default: `15`)
- `LOCALNEST_VECTOR_MAX_TERMS` (default: `80`)
- `LOCALNEST_VECTOR_MAX_FILES` (default: `20000`)

Runtime note:
- `sqlite-vec` backend requires a Node runtime with `node:sqlite` support (Node 22+).
- On older runtimes (for example Node 18 in some desktop MCP clients), LocalNest auto-falls back to `json` backend.

## Tools Exposed

- `server_status`
- `usage_guide`
- `list_roots`
- `list_projects`
- `project_tree`
- `search_code`
- `search_hybrid`
- `read_file`
- `summarize_project`
- `index_status`
- `index_project`
