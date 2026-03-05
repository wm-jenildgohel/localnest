# Repository Structure

This project follows a layered Node.js service layout.

## Top-Level Layout

```text
bin/                 CLI entry points (thin wrappers)
guides/              Engineering docs and standards (this folder)
localnest-docs/      Docusaurus user documentation site
scripts/             Operational scripts used by npm commands
skills/              Bundled agent skills shipped with the package
src/                 MCP server runtime source code
test/                Node test suite
```

## Source Layout (`src/`)

```text
src/
  localnest-mcp.js                 App entry and runtime composition
  config.js                        Environment parsing and runtime defaults
  home-layout.js                   LocalNest home/config/data directory layout
  migrations/
    config-migrator.js             Backward-compatible config migrations
  server/
    schemas.js                     Shared Zod schemas for tool inputs
    tool-utils.js                  Tool registration and response helpers
    status.js                      Server status and usage-guide builders
    register-*.js                  Tool registration by domain area
  services/
    workspace-service.js           File system + project discovery
    search-service.js              Lexical/hybrid search orchestration
    vector-index-service.js        JSON vector index backend
    sqlite-vec-index-service.js    SQLite vector index backend
    memory-*.js                    Memory storage and workflow services
    update-service.js              Version check and self-update logic
```

## Ownership Rules

- Keep CLI and script files thin; put reusable logic under `src/services`.
- Register new MCP tools in `src/server/register-*.js`, not in the entrypoint.
- Keep schema definitions centralized in `src/server/schemas.js`.
- Add or update tests in `test/` whenever behavior changes.

