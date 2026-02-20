# LocalNest

LocalNest is a local-first MCP server for code context retrieval.

It is built for teams and solo developers who want AI tools to understand their codebases without exposing source outside their machine or trusted network boundaries.

This README is the operational guide for running, tuning, extending, and troubleshooting LocalNest.

## 1. Product Goal

LocalNest exists to solve one problem well:

- Let MCP-compatible AI tools ask focused questions about your local repositories.
- Keep the retrieval pipeline deterministic, secure, and cheap.
- Avoid sending entire codebases into prompts.

Core model:

1. Discover project aliases.
2. Search for relevant files/lines.
3. Pull exact snippets.
4. Feed only relevant context to AI.

## 2. Core Principles

- Local-first: local disk is source of truth.
- Read-only by design: no write/edit/exec tools exposed.
- Bounded execution: every heavy path has limits/timeouts.
- Secure defaults: deny-list + path containment + hidden roots.
- Progressive fallback: fast backend first, safe fallback if missing.

## 3. Tool Bible (Purpose of Each Tool)

### `list_projects`

Purpose:

- Return the currently configured project aliases available for retrieval.

Use when:

- AI needs to know target project names before calling other tools.
- You want to verify setup/discovery worked.

Returns:

- `projects`: list of names (or name+root when explicitly enabled)
- `count`
- `exposeProjectRoots`

### `search_code`

Purpose:

- Find relevant file/line candidates for a query.

Use when:

- AI needs to locate where a concept, class, function, route, or config appears.

Search backend order:

1. `ripgrep` (`rg`) - primary fast path.
2. `git grep` - fallback for git repos.
3. Bounded Dart recursive scan - final fallback.

Returns:

- `query`
- `count`
- `matches[]` with:
  - `project`
  - `path`
  - `line`
  - `preview`
- `meta`:
  - `cacheHit`
  - `backends`
  - `partial` (true if deadline/limits cut execution)

### `get_file_snippet`

Purpose:

- Return exact file lines for precise context.

Use when:

- AI has candidate files and needs exact implementation details.

Modes:

- explicit range: `startLine`, `endLine`
- centered window: `aroundLine`, `contextLines`

Returns:

- `project`, `path`, `startLine`, `endLine`, `snippet`

### `get_repo_structure`

Purpose:

- Lightweight tree exploration for architecture orientation.

Use when:

- AI needs folder structure before deeper retrieval.
- You want quick sanity checks on project scope.

Returns:

- `project`, `maxDepth`, `maxEntries`, `count`, `entries[]`

## 4. Runtime Architecture

Components:

- `McpStdioServer` (`lib/src/mcp_stdio_server.dart`)
  - MCP transport framing and protocol handling.
- `LocalNestTools` (`lib/src/tools.dart`)
  - Tool execution logic and fallback search pipeline.
- `LocalNestConfig` (`lib/src/models.dart`)
  - Config parsing, defaults, and guardrails.
- `setupLocalNest` (`lib/src/setup.dart`)
  - One-command setup and config generation.
- `runLocalNestDoctor` (`lib/src/doctor.dart`)
  - Environment diagnostics.

High-level flow:

1. MCP client sends framed JSON-RPC request.
2. Transport validates frame size and parses method.
3. Tool handler executes with guardrails.
4. Structured result returned in MCP format.

## 5. Setup and Installation

## Prerequisites

- Dart SDK
- Git
- ripgrep (recommended)

## Build native binary

```bash
./tool/build_exe.sh
```

Output:

- `build/localnest`

## One-command setup

Single project root:

```bash
./build/localnest --setup --name scripts --root /absolute/path/to/Scripts
```

Split big parent root into discovered subprojects:

```bash
./build/localnest --setup --name flutter --root /absolute/path/to/Flutter --split-projects
```

Enable vector bootstrap placeholders in config:

```bash
./build/localnest --setup --name flutter --root /absolute/path/to/Flutter --split-projects --enable-vector-bootstrap
```

Custom config path:

```bash
./build/localnest --setup --name scripts --root /absolute/path/to/Scripts --config /absolute/path/localnest.config.json
```

## Environment doctor

```bash
./build/localnest --doctor
```

Checks:

- `dart`
- `git`
- `rg`

Also prints OS-specific install hints when `rg` is missing.

## 6. MCP Client Integration

Add to root `.mcp.json`:

```json
{
  "mcpServers": {
    "localnest": {
      "command": "/absolute/path/to/localnest/build/localnest",
      "args": [
        "--config",
        "/absolute/path/to/localnest.config.json"
      ]
    }
  }
}
```

## 7. Configuration Reference

Example:

```json
{
  "exposeProjectRoots": false,
  "allowBroadRoots": false,
  "maxConcurrentSearches": 4,
  "searchTimeoutMs": 8000,
  "searchCacheTtlSeconds": 20,
  "searchCacheMaxEntries": 200,
  "projects": [
    { "name": "scripts", "root": "/absolute/path/to/Scripts" },
    { "name": "mobile_app", "root": "/absolute/path/to/mobile-app" }
  ],
  "denyPatterns": [
    ".env",
    ".pem",
    ".key",
    "secrets/",
    "node_modules/",
    ".git/",
    "build/",
    "dist/",
    "coverage/"
  ],
  "vector": {
    "enabled": false
  }
}
```

Field reference:

- `projects[]`
  - retrieval scope; each entry is `{name, root}`.
- `exposeProjectRoots`
  - include absolute roots in `list_projects`; default `false`.
- `allowBroadRoots`
  - allows broad roots like `/`; default `false`.
- `maxConcurrentSearches`
  - bounded worker count across projects.
- `searchTimeoutMs`
  - deadline budget per query pipeline.
- `searchCacheTtlSeconds`
  - cache lifetime for repeated queries.
- `searchCacheMaxEntries`
  - in-memory cache capacity.
- `denyPatterns[]`
  - deny-list substrings for path filtering.
- `vector`
  - optional bootstrap placeholders for external vector setup.

## 8. Security Model

Guardrails implemented:

- Read-only API surface.
- Path traversal protection (`..` + root containment check).
- Deny-list filtering across search/tree/snippet.
- Root-hiding in `list_projects` by default.
- Transport frame limits:
  - max header bytes
  - max body bytes
  - max in-memory buffer
- No shell execution exposed via MCP tools.

Recommended production posture:

- Keep project roots narrow (per app/service).
- Keep `allowBroadRoots=false`.
- Keep `exposeProjectRoots=false` unless necessary.
- Extend `denyPatterns` for organization secrets conventions.

## 9. Performance and Scaling

Why it is fast:

- Prioritizes `ripgrep` backend.
- Uses bounded parallel project search.
- Uses TTL cache for repeated prompts.
- Applies hard limits for snippet lines and tree entries.

Important performance strategy:

- Prefer `--split-projects` for giant folder trees.
- Query a specific project alias when possible.
- Keep timeout realistic for your machine (`searchTimeoutMs`).

Understanding `meta.partial`:

- `partial=true` means result is valid but may be incomplete due to deadline/limit safeguards.

## 10. Search Backends and Fallback Behavior

Backend selection:

1. `ripgrep` if available.
2. `git grep` if `rg` unavailable and project is a git repo.
3. Dart scan fallback when both are unavailable or not suitable.

This ensures LocalNest still functions in minimal environments.

## 11. Cross-Platform Notes

Supported environments:

- Linux
- macOS
- Windows

Notes:

- Build binary per platform/arch.
- `tool/build_exe.sh` is shell-based; on Windows use `dart compile exe` directly.
- Path resolution uses `package:path` and normalizes separators.

## 12. Troubleshooting

### `search_code` slow or timing out

Actions:

- Use `--split-projects` and target a specific alias.
- Reduce project scope.
- Increase `searchTimeoutMs` moderately.
- Ensure `rg` is installed (`--doctor`).

### No results but file exists

Actions:

- Verify query string and case mode.
- Confirm target project alias.
- Check deny patterns are not filtering the path.

### `list_projects` missing expected project

Actions:

- Re-run `--setup` for that project.
- Inspect config `projects[]` directly.

### `rg` missing

Actions:

- Run `--doctor` and install from suggested command.
- LocalNest still works via fallback but may be slower.

## 13. Developer Workflow

Useful commands:

```bash
dart format .
dart analyze
dart test
./tool/build_exe.sh
```

## 14. Design Notes (SOLID Mapping)

- Single Responsibility:
  - transport, tools, config, setup separated.
- Open/Closed:
  - add tools by extending tool dispatch logic.
- Liskov/Interface Segregation:
  - protocol depends on minimal tool executor contract.
- Dependency Inversion:
  - server runtime talks to abstraction, not hardwired IO logic.

## 15. Practical MCP Usage Patterns

Typical AI retrieval sequence:

1. `list_projects`
2. `search_code`
3. `get_file_snippet`
4. optional `get_repo_structure` for broader architecture questions

This keeps token usage low and response relevance high.

## 16. Beta Scope and Roadmap

Current beta focus:

- reliability
- predictable latency
- secure local context retrieval

Planned future upgrades:

- optional persistent local index
- optional external vector retrieval integration
- richer symbol-aware search mode

## 17. License

MIT.
