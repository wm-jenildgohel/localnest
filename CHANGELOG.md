# Changelog

All notable changes to this project will be documented in this file.

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
