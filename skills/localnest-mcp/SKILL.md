---
name: localnest-mcp
description: Operate and troubleshoot LocalNest MCP for local code retrieval workflows. Use when users need to install/setup LocalNest, configure MCP client JSON, diagnose LocalNest MCP errors (doctor/import/file-size/search/index issues), or run high-signal retrieval flow with localnest_* tools.
---

# LocalNest MCP

Run LocalNest MCP setup, diagnostics, and retrieval workflows with safe defaults.

## Execute Setup

Prefer global install for deterministic behavior.

1. Install globally.
```bash
npm install -g localnest-mcp
```

2. Run setup and doctor.
```bash
localnest-mcp-setup
localnest-mcp-doctor
```

3. Paste printed `mcpServers.localnest` config block into the MCP client config.

Fallback only when global install cannot be used:
```bash
npx -y localnest-mcp-setup
npx -y localnest-mcp-doctor
```

## Run Validation Gates

From LocalNest repo before release:
```bash
npm run check
npm test
npm run doctor
npm pack --dry-run
```

If `npm pack --dry-run` fails due cache permissions, use:
```bash
npm_config_cache=/tmp/.npm-cache npm pack --dry-run
```

## Use Retrieval Flow

Prefer canonical tool names:
1. `localnest_server_status`
2. `localnest_list_roots`
3. `localnest_list_projects`
4. `localnest_index_status`
5. `localnest_index_project`
6. `localnest_search_hybrid`
7. `localnest_read_file`

Notes:
- Use `response_format: "json"` for machine processing; use `"markdown"` for readable output.
- List tools return pagination metadata (`total_count`, `has_more`, `next_offset`, etc.).

## Troubleshoot Fast

### MCP SDK import error (`ERR_MODULE_NOT_FOUND`)

Symptom: doctor fails at `sdk_import`.

Fix:
```bash
npm install
npm run doctor
```

### `ripgrep` missing

Symptom: setup/doctor/search failure around `rg`.

Fix: install ripgrep, then rerun doctor.

### File too large in `read_file`

LocalNest keeps a file-size cap for safety. Current behavior streams and returns the requested line-window for oversized files, with warning metadata, instead of hard-failing.

### SQLite runtime limitations

If `sqlite-vec` is unavailable, LocalNest falls back to JSON backend automatically. Confirm using `localnest_server_status` and `localnest_index_status`.

## Release Versioning

Set explicit beta version when needed:
```bash
npm version 0.0.2-beta.2 --no-git-tag-version
npm pkg get version
npm pack --dry-run
```

Publish beta:
```bash
npm run release:beta
```
