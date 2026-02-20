# LocalNest

LocalNest is a local-only MCP server for project context retrieval.

It is designed for safe, low-cost context access across your cloned repositories with no hosted AI dependency.

## Features

- MCP stdio server (JSON-RPC over `Content-Length` framing)
- `list_projects`
- `search_code` (uses `rg` / ripgrep)
- `get_file_snippet`
- `get_repo_structure`
- Local-root allowlisting and deny-pattern filtering
- Project root paths hidden by default

## Install

```bash
dart pub get
```

## Run

```bash
dart run localnest --config /absolute/path/localnest.config.json
```

or set env:

```bash
export LOCALNEST_CONFIG=/absolute/path/localnest.config.json
dart run localnest
```

### Build Native Binary (Faster Startup)

```bash
./tool/build_exe.sh
./build/localnest --config /absolute/path/localnest.config.json
```

### One-Command Setup

```bash
./build/localnest --setup --name scripts --root /absolute/path/to/Scripts
```

This creates/updates config (default: `~/.localnest/config.json`) and prints a ready MCP snippet.

### Environment Doctor

```bash
./build/localnest --doctor
```

Checks `dart`, `git`, and `rg` availability and prints platform-specific `rg` install hints.

## Config

`localnest.config.json`

```json
{
  "exposeProjectRoots": false,
  "allowBroadRoots": false,
  "maxConcurrentSearches": 4,
  "searchTimeoutMs": 8000,
  "searchCacheTtlSeconds": 20,
  "searchCacheMaxEntries": 200,
  "projects": [
    { "name": "scripts", "root": "/path/to/Scripts" },
    { "name": "mobile_app", "root": "/path/to/mobile-app" }
  ],
  "denyPatterns": [
    ".env",
    ".pem",
    ".key",
    "secrets/",
    "node_modules/",
    ".git/"
  ]
}
```

## MCP Client Example

Add to `.mcp.json`:

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

## Security Model

- Read-only retrieval tools only
- Path traversal blocked (`..` / outside-root resolution denied)
- Deny patterns applied to search/tree/snippet outputs
- Root paths hidden by default in `list_projects`
- No shell execution tool exposed
- Logs and errors go to `stderr` to keep MCP transport clean

## SOLID Design Mapping

- **S (Single Responsibility)**:
  - `McpStdioServer` handles protocol IO only.
  - `LocalNestTools` handles domain logic only.
  - `LocalNestConfig` handles config loading/parsing only.
- **O (Open/Closed)**:
  - Tool dispatch is centralized and extensible by adding new handlers.
- **L (Liskov Substitution)**:
  - `ToolExecutor` abstraction allows replacing executor without changing server runtime.
- **I (Interface Segregation)**:
  - Minimal `ToolExecutor` interface exposes only what protocol runtime needs.
- **D (Dependency Inversion)**:
  - Protocol server depends on `ToolExecutor` abstraction, not concrete tool class.

## Performance Notes

- `search_code` delegates heavy search to ripgrep.
- If `rg` is missing, LocalNest falls back to `git grep`, then to bounded Dart file scanning.
- Bounded parallel multi-project search via `maxConcurrentSearches`.
- Per-project search timeout via `searchTimeoutMs`.
- In-memory TTL cache for repeated searches (`searchCacheTtlSeconds`, `searchCacheMaxEntries`).
- Default limits are applied (`maxResults`, snippet lines, tree entries, query length).
- Keep project roots scoped to active repos for faster responses.
- Overly broad roots are blocked by default (`allowBroadRoots: false`).
