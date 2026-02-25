# Changelog

All notable changes to this project will be documented in this file.

## [0.0.2-beta.2] - 2026-02-25

### Added
- Added canonical MCP tool names with `localnest_*` prefix while keeping legacy aliases for backward compatibility.
- Added MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) across exposed tools.
- Added `response_format` support (`json`/`markdown`) to tool responses.
- Added pagination metadata for list-style tools (`total_count`, `count`, `limit`, `offset`, `has_more`, `next_offset`, `items`).
- Added bundled skill distribution in package under `skills/localnest-mcp`.
- Added new command: `localnest-mcp-install-skill`.
- Added automatic bundled skill install on package install (`postinstall`) with opt-out `LOCALNEST_SKIP_SKILL_INSTALL=true`.
- Added comprehensive test suite for config, migrator, search, workspace, vector index, and sqlite index flows.

### Changed
- README rewritten with clearer global-first installation flow, setup/doctor guidance, troubleshooting, and release checklist.
- Setup wizard now prints a ready-to-paste global `mcpServers.localnest` JSON block directly after completion.
- Usage guide output now references canonical `localnest_*` tools.
- Release version updated to `0.0.2-beta.2` in package and runtime server status.

### Fixed
- Fixed hybrid retrieval merge so overlapping lexical + semantic hits are fused into hybrid results.
- Fixed cross-platform sqlite base-path matching for both slash and backslash descendants.
- Reworked sqlite index updates to incremental DF/norm refresh for better scalability.
- Added semantic SQL prefiltering to reduce query scan scope.
- Replaced sqlite transaction helper usage with explicit `BEGIN/COMMIT/ROLLBACK` for runtime compatibility.
- Improved oversized file handling in `read_file`: keep cap guard but return streamed line-window content with warning metadata instead of hard failure.

## [0.0.1-beta.1] - 2026-02-24

### Added
- Single-package Node.js layout at repository root (no `node-mcp/` subfolder).
- `localnest-mcp-doctor` command for environment and config diagnostics.
- Phase 1 local semantic indexing service (`localnest.index.json`) with chunked TF-IDF-style retrieval.
- New MCP tools:
  - `index_status`
  - `index_project`
  - `search_hybrid`
- Added pluggable index backend architecture with `sqlite-vec` (default) and `json` fallback.
- Added automatic config migration on startup with backup creation for safe upgrades.
- Release scripts for maintainable npm publishing:
  - `release:beta`
  - `release:latest`
  - `bump:beta`

### Changed
- Setup wizard now validates Node, npx, and ripgrep before writing config.
- Setup wizard now generates `npx.cmd` on Windows and `npx` on Linux/macOS.
- Setup wizard now asks users to choose index backend and persists indexing settings in generated config.
- Server now fails fast when ripgrep is missing.
- Package metadata updated for beta publishing from the root package.

### Fixed
- Resolved confusion around monorepo path by making root the npm package path.
