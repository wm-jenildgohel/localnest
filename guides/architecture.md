# Architecture

## Runtime Model

LocalNest runs as an MCP stdio server:

1. Parse runtime config and environment (`src/config.js`).
2. Build core services (`workspace`, `search`, `index`, `updates`, `memory`).
3. Register tools by domain (`core`, `retrieval`, `memory workflow`, `memory store`).
4. Serve requests over stdio transport.

## Layering

- Composition layer: `src/localnest-mcp.js`
- Tool/API layer: `src/server/register-*.js`
- Domain layer: `src/services/*.js`
- Shared contracts: `src/server/schemas.js`

Each layer should only depend on lower-level layers.

## Service Boundaries

- `WorkspaceService`: roots, project detection, tree, file reads
- `SearchService`: lexical search and hybrid ranking orchestration
- `VectorIndexService` / `SqliteVecIndexService`: semantic index backends
- `MemoryService`: durable memory CRUD and status
- `MemoryWorkflowService`: event/outcome workflow for memory capture
- `UpdateService`: version checks and self-update actions

## Backend Strategy

- Index backend is selected at runtime (`sqlite-vec` preferred, JSON fallback).
- Memory subsystem is optional and remains isolated from core retrieval behavior.
- If optional subsystems fail, core search/read operations continue to work.

## Design Principles

- Favor composition over global mutable state.
- Keep tool handlers thin and delegate to services.
- Return plain serializable data from handlers.
- Add explicit schema validation for every tool input.

