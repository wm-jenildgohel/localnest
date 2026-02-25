---
name: localnest-mcp
description: Install, configure, and use LocalNest MCP for local code retrieval workflows. Trigger this skill when user requests are about project files, code, or repository data under configured local roots (for example: find symbol, read file, summarize project, search codebase, compare files, inspect folder tree, index/search local docs). Use for setup, MCP config guidance, daily localnest_* tool usage flow, and troubleshooting for doctor/import/file-size/search/index issues.
---

# LocalNest MCP

Run end-user installation and usage workflows for LocalNest MCP.

## AI Activation Rules

Activate LocalNest MCP when:
- User asks about code, files, symbols, or project structure in local repositories.
- User asks to search or read content from data already present in configured roots.
- User asks for project summaries, root/project listing, or targeted file ranges.
- User asks semantic/hybrid retrieval over local code/docs.

Do not activate LocalNest MCP when:
- User asks for internet-only/current-events data.
- User asks about files outside configured LocalNest roots.
- User asks non-repository tasks unrelated to local project data.

Decision shortcut:
1. If query depends on local repo content → use LocalNest.
2. If query depends on web/current external content → use web search.
3. If both are needed → use LocalNest for local facts, then web for external facts.

## Install And Configure

Prefer global install for stable behavior.

1. Install package.
```bash
npm install -g localnest-mcp
```

2. Install/update bundled skill.
```bash
localnest-mcp-install-skill
```

3. Run setup + health check.
```bash
localnest-mcp-setup
localnest-mcp-doctor
```

4. Copy the printed `mcpServers.localnest` JSON block into the MCP client config.
5. Restart MCP client.

Fallback only when global install is unavailable:
```bash
npx -y localnest-mcp-setup
npx -y localnest-mcp-doctor
```

## Use LocalNest Tools

Default retrieval workflow:
1. `localnest_server_status`
2. `localnest_list_roots`
3. `localnest_list_projects`
4. `localnest_index_status`
5. `localnest_index_project`
6. `localnest_search_hybrid`
7. `localnest_read_file`

Call `localnest_usage_guide` at any time to get embedded best-practice guidance from the server itself.

## Tool Reference

### `localnest_usage_guide`
Returns structured best-practice guidance for users and AI agents. No params. Call this when unsure about the correct workflow.

### `localnest_server_status`
Returns runtime config: active roots, ripgrep status, index backend (`sqlite-vec` or `json`), chunk settings. Always call first in a new session.

### `localnest_list_roots`
Lists configured roots. Supports `limit` / `offset` pagination.

### `localnest_list_projects`
Lists first-level projects under a root. Params: `root_path` (optional), `limit`, `offset`.

### `localnest_project_tree`
Returns compact file/folder tree. Params: `project_path` (required), `max_depth` (1–8, default 3), `max_entries` (default 1500). Start with low `max_depth`, expand if needed.

### `localnest_index_status`
Returns semantic index metadata (exists, stale, backend, file count). Use before indexing.

### `localnest_index_project`
Builds or refreshes semantic index. Params:
- `project_path` (optional) — scope to one project
- `all_roots` (bool, default false) — index all roots
- `force` (bool, default false) — rebuild even if fresh
- `max_files` (default 20000) — cap on files indexed

Prefer project-scoped over all-roots for speed.

### `localnest_search_code`
Lexical ripgrep search. Use for exact symbol names, identifiers, regex patterns. Params:
- `query` (required)
- `project_path` (optional)
- `all_roots` (bool, default false)
- `glob` (file filter pattern, default `*`)
- `max_results` (default varies)
- `case_sensitive` (bool, default false)

### `localnest_search_hybrid`
Lexical + semantic search with RRF ranking. Best for concept-level or natural-language queries. Params:
- `query` (required)
- `project_path` (optional) — combine with this for precision
- `all_roots` (bool, default false)
- `glob` (file filter pattern, default `*`)
- `max_results`
- `case_sensitive` (bool, default false)
- `min_semantic_score` (0–1, default 0.05) — raise to filter weak semantic hits

### `localnest_read_file`
Reads a bounded line window from a file with line numbers. Params: `path`, `start_line` (default 1), `end_line` (default cap). **Window is capped at 800 lines.** Oversized windows return available content with warning metadata — no hard failure. Read narrow ranges first, then expand.

### `localnest_summarize_project`
High-level summary: language breakdown, extension stats, file counts. Params: `project_path` (required), `max_files` (default 3000).

## Usage Rules

- All tools accept `response_format: "json"` (default, for processing) or `"markdown"` (for readable output).
- For list tools, pass `limit` + `offset`; continue while `has_more` is true using `next_offset`.
- Prefer `project_path` for focused retrieval. Use `all_roots=true` only for cross-project queries.
- Tools also respond to short aliases: `server_status`, `list_roots`, `list_projects`, `project_tree`, `index_status`, `index_project`, `search_code`, `search_hybrid`, `read_file`, `summarize_project`, `usage_guide`.

## Evidence-First Pattern

1. Discover scope (`localnest_list_roots`, `localnest_list_projects`).
2. Retrieve candidates (`localnest_search_code` or `localnest_search_hybrid`).
3. Validate with exact lines (`localnest_read_file`).
4. Answer with file-grounded results.

## Troubleshooting

### Doctor fails with MCP SDK import error

Symptom: `sdk_import` check fails (`ERR_MODULE_NOT_FOUND`).

Fix:
```bash
npm install
localnest-mcp-doctor
```

### ripgrep missing

Symptom: setup/doctor/search fails around `rg`.

Fix by platform:
- macOS: `brew install ripgrep`
- Linux: `sudo apt-get install ripgrep`
- Windows: `winget install BurntSushi.ripgrep.MSVC`

Then set PATH in your MCP client env if `rg` is installed but still not found.

### File exceeds size cap in `read_file`

LocalNest caps reads at 800 lines per window. Oversized requests return available content with warning metadata. Narrow your `start_line`/`end_line` range.

### sqlite-vec unavailable

LocalNest auto-falls back to JSON backend. Confirm active backend via:
- `localnest_server_status` → `vector_index.backend` (actual) vs `vector_index.requested_backend` (configured)
- `localnest_index_status`
