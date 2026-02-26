# LocalNest MCP

A local-first MCP server that gives AI agents safe, read-only access to your codebase — with optional semantic indexing for high-quality retrieval.

## What It Does

- **File discovery** — scoped, safe reads under configured roots
- **Lexical search** — fast ripgrep-backed pattern/symbol search
- **Semantic indexing** — `sqlite-vec` or JSON backend, fully local
- **Hybrid retrieval** — lexical + semantic fusion with RRF ranking
- **Project introspection** — roots, projects, tree, summaries

All data stays on your machine. No external indexing service required.

## Requirements

- Node.js `>=18`
- `ripgrep` (`rg`)

Install ripgrep:

| Platform | Command |
|---|---|
| Ubuntu/Debian | `sudo apt-get install ripgrep` |
| macOS | `brew install ripgrep` |
| Windows (winget) | `winget install BurntSushi.ripgrep.MSVC` |
| Windows (choco) | `choco install ripgrep` |

## Installation

**Global install (recommended):**
```bash
npm install -g localnest-mcp
localnest-mcp-install-skill
localnest-mcp-setup
localnest-mcp-doctor
```

**npx fallback** (if global install is unavailable):
```bash
npx -y localnest-mcp-setup
npx -y localnest-mcp-doctor
```

> Global install is preferred — it gives more deterministic dependency resolution and avoids transient npx cache issues.

## MCP Client Configuration

After running setup, copy `~/.localnest/mcp.localnest.json` into your MCP client config, or use this template:

```json
{
  "mcpServers": {
    "localnest": {
      "command": "npx",
      "args": ["-y", "localnest-mcp"],
      "startup_timeout_sec": 30,
      "env": {
        "MCP_MODE": "stdio",
        "LOCALNEST_CONFIG": "~/.localnest/localnest.config.json",
        "LOCALNEST_INDEX_BACKEND": "sqlite-vec",
        "LOCALNEST_DB_PATH": "~/.localnest/localnest.db",
        "LOCALNEST_INDEX_PATH": "~/.localnest/localnest.index.json"
      }
    }
  }
}
```

> **Windows:** Setup auto-generates `npx.cmd` in `mcp.localnest.json` — use that file directly.

Restart your MCP client after updating the config.

If your client reports MCP startup timeout (for example 10s default), increase it:

```toml
[mcp_servers.localnest]
startup_timeout_sec = 30
```

## Tools

| Tool | Purpose |
|---|---|
| `localnest_usage_guide` | Best-practice guidance for agents — call this first when unsure |
| `localnest_server_status` | Runtime config, roots, ripgrep status, index backend |
| `localnest_list_roots` | List configured roots |
| `localnest_list_projects` | List projects under a root |
| `localnest_project_tree` | File/folder tree for a project |
| `localnest_index_status` | Semantic index metadata (exists, stale, backend) |
| `localnest_index_project` | Build or refresh semantic index |
| `localnest_search_code` | Lexical search (exact symbols, regex, identifiers) |
| `localnest_search_hybrid` | Hybrid search (lexical + semantic, RRF-ranked) |
| `localnest_read_file` | Read a bounded line window from a file |
| `localnest_summarize_project` | Language/extension breakdown for a project |

All tools support `response_format: "json"` (default) or `"markdown"`.

Short aliases without the `localnest_` prefix are also supported (e.g. `server_status`, `search_hybrid`).

**List tools** return pagination fields: `total_count`, `count`, `limit`, `offset`, `has_more`, `next_offset`, `items`.

**Recommended agent workflow:**
```
localnest_server_status → localnest_list_roots → localnest_list_projects
→ localnest_index_status → localnest_index_project
→ localnest_search_hybrid → localnest_read_file
```

## Index Backend

Choose during setup or via env var:

| Backend | When to use |
|---|---|
| `sqlite-vec` | Recommended. Persistent SQLite DB, efficient for large repos. Requires Node 22+. |
| `json` | Compatibility fallback for older Node runtimes. Auto-selected if sqlite-vec is unavailable. |

## Configuration Reference

Setup writes two files:
- `~/.localnest/localnest.config.json` — roots and project settings
- `~/.localnest/mcp.localnest.json` — ready-to-paste MCP client config block

**Config priority:**
1. `PROJECT_ROOTS` environment variable
2. `LOCALNEST_CONFIG` file
3. Current working directory (fallback)

**Optional env vars:**

| Variable | Default | Description |
|---|---|---|
| `LOCALNEST_INDEX_BACKEND` | `sqlite-vec` | `sqlite-vec` or `json` |
| `LOCALNEST_DB_PATH` | `~/.localnest/localnest.db` | SQLite database path |
| `LOCALNEST_INDEX_PATH` | `~/.localnest/localnest.index.json` | JSON index path |
| `LOCALNEST_SQLITE_VEC_EXTENSION` | — | Custom extension path |
| `LOCALNEST_VECTOR_CHUNK_LINES` | `60` | Lines per index chunk |
| `LOCALNEST_VECTOR_CHUNK_OVERLAP` | `15` | Overlap between chunks |
| `LOCALNEST_VECTOR_MAX_TERMS` | `80` | Max terms per chunk |
| `LOCALNEST_VECTOR_MAX_FILES` | `20000` | Max files per index run |

## Auto-Migration

On startup, LocalNest auto-migrates older config schemas. A non-destructive backup (`localnest.config.json.bak.<timestamp>`) is created before any migration. No manual setup rerun needed for normal upgrades.

## Skill Distribution

LocalNest ships with a bundled AI agent skill (`localnest-mcp`) for Claude Code, Cursor, Codex, and other supported clients.

Run after `npm install`:
```bash
localnest-mcp-install-skill
# Force reinstall:
localnest-mcp-install-skill --force
```

**Install from GitHub via skills.sh:**
```bash
npx skills add https://github.com/wm-jenildgohel/localnest --skill localnest-mcp
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
  
