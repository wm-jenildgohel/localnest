# LocalNest MCP

[![npm version](https://img.shields.io/npm/v/localnest-mcp)](https://www.npmjs.com/package/localnest-mcp)
[![Node.js](https://img.shields.io/node/v/localnest-mcp)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Quality](https://github.com/wmt-mobile/localnest/actions/workflows/quality.yml/badge.svg?branch=beta)](https://github.com/wmt-mobile/localnest/actions/workflows/quality.yml)
[![CodeQL](https://github.com/wmt-mobile/localnest/actions/workflows/codeql.yml/badge.svg?branch=beta)](https://github.com/wmt-mobile/localnest/actions/workflows/codeql.yml)
[![Socket Badge](https://badge.socket.dev/npm/package/localnest-mcp/0.0.4-beta.4)](https://badge.socket.dev/npm/package/localnest-mcp/0.0.4-beta.4)

A local-first MCP server that gives AI agents safe access to your codebase, plus optional local memory and semantic indexing for high-quality retrieval.

Documentation: https://wmt-mobile.github.io/localnest/

Current beta package: `0.0.4-beta.4`

Engineering docs for contributors:
- [`guides/README.md`](./guides/README.md)
- [`guides/repository-structure.md`](./guides/repository-structure.md)
- [`guides/architecture.md`](./guides/architecture.md)
- [`guides/code-standards.md`](./guides/code-standards.md)

## What It Does

- **File discovery** — scoped, safe reads under configured roots
- **Lexical search** — fast ripgrep-backed pattern/symbol search
- **Semantic indexing** — `sqlite-vec` or JSON backend, fully local
- **Hybrid retrieval** — lexical + semantic fusion with RRF ranking
- **Project introspection** — roots, projects, tree, summaries
- **Local agent memory** — durable project knowledge, preferences, and recall, stored on your machine

All data stays on your machine. No external indexing service required.

## Requirements

- Node.js `>=18`
- `ripgrep` (`rg`) recommended for fastest lexical search (server still starts without it)

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

Check the installed CLI version:

```bash
localnest-mcp --version
```

## MCP Client Configuration

After running setup, copy `~/.localnest/config/mcp.localnest.json` into your MCP client config, or use this template:

```json
{
  "mcpServers": {
    "localnest": {
      "command": "npx",
      "args": ["-y", "localnest-mcp"],
      "startup_timeout_sec": 30,
      "env": {
        "MCP_MODE": "stdio",
        "LOCALNEST_CONFIG": "~/.localnest/config/localnest.config.json",
        "LOCALNEST_INDEX_BACKEND": "sqlite-vec",
        "LOCALNEST_DB_PATH": "~/.localnest/data/localnest.db",
        "LOCALNEST_INDEX_PATH": "~/.localnest/data/localnest.index.json",
        "LOCALNEST_MEMORY_ENABLED": "false",
        "LOCALNEST_MEMORY_BACKEND": "auto",
        "LOCALNEST_MEMORY_DB_PATH": "~/.localnest/data/localnest.memory.db"
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
| `localnest_task_context` | One-call runtime + memory context for a substantive task |
| `localnest_memory_status` | Memory consent, backend compatibility, database status |
| `localnest_memory_list` | List stored memories |
| `localnest_memory_get` | Fetch one memory with revision history |
| `localnest_memory_store` | Store a durable memory manually |
| `localnest_memory_update` | Update a memory and append a revision |
| `localnest_memory_delete` | Delete a memory |
| `localnest_memory_recall` | Recall relevant memories for a task/query |
| `localnest_capture_outcome` | One-call outcome capture into the memory event pipeline |
| `localnest_memory_capture_event` | Background event ingest that auto-promotes meaningful events into memory |
| `localnest_memory_events` | Inspect recently captured memory events |
| `localnest_update_status` | Check npm for latest LocalNest version (cached interval) |
| `localnest_update_self` | Update LocalNest globally and sync bundled skill (approval required) |
| `localnest_list_roots` | List configured roots |
| `localnest_list_projects` | List projects under a root |
| `localnest_project_tree` | File/folder tree for a project |
| `localnest_index_status` | Semantic index metadata (exists, stale, backend) |
| `localnest_index_project` | Build or refresh semantic index |
| `localnest_search_files` | File/path name search (best first step for module/feature discovery) |
| `localnest_search_code` | Lexical search (exact symbols, regex, identifiers) |
| `localnest_search_hybrid` | Hybrid search (lexical + semantic, RRF-ranked) |
| `localnest_read_file` | Read a bounded line window from a file |
| `localnest_summarize_project` | Language/extension breakdown for a project |

All tools support `response_format: "json"` (default) or `"markdown"`.
Only canonical `localnest_*` tool names are exposed (no short aliases) to keep MCP clients clean and non-duplicative.

**List tools** return pagination fields: `total_count`, `count`, `limit`, `offset`, `has_more`, `next_offset`, `items`.

**Recommended agent workflow:**
```
localnest_server_status → localnest_task_context → localnest_update_status → localnest_list_roots → localnest_list_projects
→ localnest_index_status → localnest_index_project
→ localnest_search_hybrid → localnest_read_file
→ localnest_capture_outcome
```

## Index Backend

Choose during setup or via env var:

| Backend | When to use |
|---|---|
| `sqlite-vec` | Recommended. Persistent SQLite DB, efficient for large repos. Requires Node 22+. |
| `json` | Compatibility fallback for older Node runtimes. Auto-selected if sqlite-vec is unavailable. |

## Configuration Reference

Setup writes two files:
- `~/.localnest/config/localnest.config.json` — roots and project settings
- `~/.localnest/config/mcp.localnest.json` — ready-to-paste MCP client config block
- `~/.localnest/data/` — sqlite/json index files and memory database
- `~/.localnest/cache/update-status.json` — cached npm update status
- `~/.localnest/backups/` — migration and config backups

This keeps the LocalNest home directory readable:
- `config/` for editable config and generated MCP snippets
- `data/` for SQLite/JSON runtime data
- `cache/` for refreshable metadata
- `backups/` for migration history

**Config priority:**
1. `PROJECT_ROOTS` environment variable
2. `LOCALNEST_CONFIG` file
3. Current working directory (fallback)

**Optional env vars:**

| Variable | Default | Description |
|---|---|---|
| `LOCALNEST_INDEX_BACKEND` | `sqlite-vec` | `sqlite-vec` or `json` |
| `LOCALNEST_DB_PATH` | `~/.localnest/data/localnest.db` | SQLite database path |
| `LOCALNEST_INDEX_PATH` | `~/.localnest/data/localnest.index.json` | JSON index path |
| `LOCALNEST_SQLITE_VEC_EXTENSION` | — | Optional custom native extension path. If unset, no native extension load is attempted. |
| `LOCALNEST_VECTOR_CHUNK_LINES` | `60` | Lines per index chunk |
| `LOCALNEST_VECTOR_CHUNK_OVERLAP` | `15` | Overlap between chunks |
| `LOCALNEST_VECTOR_MAX_TERMS` | `80` | Max terms per chunk |
| `LOCALNEST_VECTOR_MAX_FILES` | `20000` | Max files per index run |
| `LOCALNEST_MEMORY_ENABLED` | `false` | Enable local memory subsystem |
| `LOCALNEST_MEMORY_BACKEND` | `auto` | `auto`, `node-sqlite`, or `sqlite3` |
| `LOCALNEST_MEMORY_DB_PATH` | `~/.localnest/data/localnest.memory.db` | SQLite memory database path |
| `LOCALNEST_MEMORY_AUTO_CAPTURE` | `false` | Allow background event ingest to promote memories automatically |
| `LOCALNEST_MEMORY_CONSENT_DONE` | `false` | Indicates setup consent was already collected |
| `LOCALNEST_UPDATE_PACKAGE` | `localnest-mcp` | npm package name to check/update |
| `LOCALNEST_UPDATE_CHECK_INTERVAL_MINUTES` | `120` | Refresh interval for npm update checks |
| `LOCALNEST_UPDATE_FAILURE_BACKOFF_MINUTES` | `15` | Retry interval when npm check fails |

## Local Memory

Memory is opt-in during `localnest-mcp-setup`. When enabled, LocalNest stores durable project knowledge and preferences in a local SQLite database.

- Memory currently requires Node 22.13+ for built-in `node:sqlite`
- Node 18/20 continue to support the rest of LocalNest, but memory stays unavailable on those runtimes
- If memory backend initialization fails, existing code search and read tools still work

For agents, the intended flow is:

```text
localnest_task_context
→ work with code/search tools
→ localnest_capture_outcome
```

Use the lower-level `localnest_memory_status`, `localnest_memory_recall`, and `localnest_memory_capture_event` tools only when you need finer control than the bundled high-level flow.

`localnest_memory_capture_event` is still available for automatic/background use by AI tools. High-signal events such as bug fixes, decisions, reviews, and user preferences are promoted into durable memories; weak exploratory events are recorded and ignored.

## Auto-Migration

On startup, LocalNest auto-migrates older config schemas and the older flat `~/.localnest` home layout into `config/`, `data/`, `cache/`, and `backups/`. Non-destructive config backups are written under `~/.localnest/backups/`. No manual setup rerun is needed for normal upgrades.

If an older MCP client config still points `LOCALNEST_CONFIG` at `~/.localnest/localnest.config.json`, LocalNest falls forward to the new `~/.localnest/config/localnest.config.json` path automatically.

## Skill Distribution

LocalNest ships with a bundled AI agent skill (`localnest-mcp`) for Claude Code, Cursor, Codex, and other supported clients.

Run after `npm install`:
```bash
localnest-mcp-install-skill
# Force reinstall:
localnest-mcp-install-skill --force
```

`localnest-mcp-install-skill` now checks the installed skill version first. If the target skill is already current, it reports that instead of replacing files unnecessarily. Use `--force` to resync anyway.

For deterministic shell hooks or client automation, LocalNest also ships:

```bash
localnest-mcp-task-context --task "debug auth refresh" --project-path /path/to/project
localnest-mcp-capture-outcome --task "fix auth refresh" --summary "Serialized refresh requests" --project-path /path/to/project --files-changed 2 --has-tests true
```

Both commands also accept JSON on stdin.

**Install from GitHub via skills.sh:**
```bash
npx skills add https://github.com/wmt-mobile/localnest --skill localnest-mcp
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
Engineering standards and architecture references live under [`guides/`](./guides/README.md).

## Thanks to Contributors

Thanks to everyone who contributes code, docs, reviews, testing, and issue reports to LocalNest.
Your work directly improves reliability and developer experience for the entire community.

[![Contributors](https://contrib.rocks/image?repo=wmt-mobile/localnest)](https://github.com/wmt-mobile/localnest/graphs/contributors)

## Docs Site

The Docusaurus documentation site lives in [`localnest-docs/`](./localnest-docs).

```bash
cd localnest-docs
npm install
npm run start
```

## Trust And Security Testing

LocalNest follows the common OSS security pipeline pattern used across GitHub repos.

- CI quality gate: [quality.yml](./.github/workflows/quality.yml)
- OpenSSF Scorecard scan + SARIF upload: [scorecards.yml](./.github/workflows/scorecards.yml)
- CodeQL static analysis: [codeql.yml](./.github/workflows/codeql.yml)
- Dependency and GitHub Actions update automation: [.github/dependabot.yml](./.github/dependabot.yml)
- Public Scorecard report (when indexed/public): https://scorecard.dev/viewer/?uri=github.com/wmt-mobile/localnest
  
