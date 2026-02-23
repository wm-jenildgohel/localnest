# LocalNest

LocalNest is a local MCP server for code context.

It helps AI tools retrieve focused code context with a simple flow:

1. list projects
2. search code
3. fetch exact snippets

## Fastest Way (No Build Required)

## 1) Install CLI from pub.dev

```bash
dart pub global activate localnest
```

## 2) Setup config

```bash
localnest --setup
```

`--setup` now auto-uses your current directory and infers project name.
Use explicit values only when needed:

```bash
localnest --setup --name scripts --root /absolute/path/to/Scripts
```

### 2.1 One-command setup + MCP integration (5-minute path)

```bash
localnest --setup --integrate
```

This will:
- create/update LocalNest config
- auto-write/update `.mcp.json` in current directory
- register `mcpServers.localnest` with a working command for your machine

Use a custom MCP config path when needed:

```bash
localnest --setup --integrate --mcp-file /absolute/path/to/.mcp.json
```

Client-root Flutter-only discovery (recommended for agency/client work):

```bash
localnest --setup --integrate --root /absolute/path/to/client/monorepo --name client --flutter-only
```

This scans subfolders and registers only directories that contain a Flutter `pubspec.yaml` block.

## 3) Health check

```bash
localnest --doctor
```

## 3.1 Update check

```bash
localnest --check-update
```

## 3.2 Safe auto-upgrade + MCP repair

```bash
localnest --upgrade
```

This will:
- check latest version from pub.dev
- run `dart pub global activate localnest` when update is available
- repair `localnest` MCP entry without touching other MCP servers
- create a timestamped backup of existing `.mcp.json` before changes

## 4) Inspect config

```bash
localnest --config
```

This prints:
- resolved config file path
- whether file exists
- whether config is valid
- repair command if config is broken

## 5) Add to MCP config

Recommended: use `localnest --setup --integrate` so LocalNest writes MCP config for you.
Manual setup fallback: copy the exact MCP JSON snippet printed by `localnest --setup`.
It now auto-selects a working command for your machine:
- global binary (`~/.pub-cache/bin/localnest`) when available
- source mode (`dart run /absolute/path/to/bin/localnest.dart`) when global binary is missing

```json
{
  "mcpServers": {
    "localnest": {
      "command": "localnest",
      "args": [
        "--config",
        "/absolute/path/to/localnest.config.json"
      ],
      "env": {
        "DART_SUPPRESS_ANALYTICS": "true",
        "LOCALNEST_CONFIG": "/absolute/path/to/localnest.config.json"
      }
    }
  }
}
```

## Production Configuration (Required)

Use an absolute command path in production when possible. **Note:** GUI apps like Claude Desktop or Antigravity might not inherit your terminal's `PATH`.

Valid MCP block:

```json
{
  "mcpServers": {
    "localnest": {
      "command": "/home/<your_username>/.pub-cache/bin/localnest",
      "args": [
        "--config",
        "/home/<your_username>/.localnest/config.json"
      ],
      "env": {
        "DART_SUPPRESS_ANALYTICS": "true",
        "LOCALNEST_CONFIG": "/home/<your_username>/.localnest/config.json"
      }
    }
  }
}
```
> ⚠️ **IMPORTANT:** Replace `<your_username>` with your actual system username. Use the exact JSON output provided by the `localnest --setup` command.

Do not do this:

```json
{
  "mcpServers": {
    "localnest": {
      "command": "localnest",
      "args": [
        "--config",
        "/home/<your_username>/.localnest/config.json"
      ],
      "env": {
        "DART_SUPPRESS_ANALYTICS": "true",
        "LOCALNEST_CONFIG": "/home/<your_username>/.localnest/config.json"
      }
    }
  }
}
```

Reason: `command` might fail silently if `localnest` is not in the system `PATH` of the calling application.

Required config file (`/home/<your_username>/.localnest/config.json`) example:

```json
{
  "exposeProjectRoots": false,
  "allowBroadRoots": false,
  "maxConcurrentSearches": 4,
  "searchTimeoutMs": 8000,
  "searchCacheTtlSeconds": 20,
  "searchCacheMaxEntries": 200,
  "projects": [
    {
      "name": "prod",
      "root": "/absolute/path/to/real/project"
    }
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

## Run From Source (Also No Build)

```bash
cd localnest
dart pub get
dart run localnest --setup --name scripts --root /absolute/path/to/Scripts
dart run localnest --doctor
dart run localnest --config /absolute/path/to/localnest.config.json
```

MCP config for source mode:

```json
{
  "mcpServers": {
    "localnest": {
      "command": "dart",
      "args": [
        "run",
        "/absolute/path/to/localnest/bin/localnest.dart",
        "--config",
        "/absolute/path/to/localnest.config.json"
      ]
    }
  }
}
```

## Optional: Native Binary Build

Only needed if you want a standalone binary with faster startup.

```bash
cd localnest
./tool/build_exe.sh
./build/localnest --config /absolute/path/to/localnest.config.json
```

## Tool Reference

| Tool | Purpose | Typical Use |
|---|---|---|
| `list_projects` | List project aliases | First call to discover targets |
| `search_code` | Find matching files/lines | Locate implementation points |
| `get_file_snippet` | Read exact line ranges | Pull context for AI response |
| `get_repo_structure` | Lightweight tree view | Understand project layout |

### `search_code` backend order

1. `ripgrep` (`rg`)
2. `git grep`
3. bounded Dart file scan

Result metadata:

- `meta.cacheHit`
- `meta.backends`
- `meta.partial` (`true` if timeout/limits ended early)

## CLI Commands

| Command | What it does |
|---|---|
| `--setup` | Create/update config (defaults to current directory and inferred project name) |
| `--doctor` | Check `dart`, `git`, `rg` and show install hints |
| `--config` | Inspect default config path and validity |
| `--config <path>` | Use explicit config path (inspect/manual run) |

## Minimal Config

```json
{
  "exposeProjectRoots": false,
  "allowBroadRoots": false,
  "maxConcurrentSearches": 4,
  "searchTimeoutMs": 8000,
  "searchCacheTtlSeconds": 20,
  "searchCacheMaxEntries": 200,
  "projects": [
    { "name": "scripts", "root": "/absolute/path/to/Scripts" }
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

> 📌 **Future Milestone Notice:** The `vector` configuration block is automatically generated as a placeholder for an upcoming feature. Currently, LocalNest relies entirely on `ripgrep`/`git grep` and does not require you to install Qdrant, Ollama, or any other vector tools to function fully.

## Security Defaults

- read-only tools only
- path traversal blocked
- deny-pattern filtering
- root paths hidden by default
- MCP frame size guards

## Performance Tips

1. Setup process automatically splits large parent directories via sub-projects for better performance.
2. Query specific project aliases instead of giant roots.
3. Keep `rg` installed for fast search.
4. Tune `searchTimeoutMs` and `maxConcurrentSearches` per machine.

## Troubleshooting

### `localnest` command not found

- ensure Dart global bin is on PATH
- usually: `$HOME/.pub-cache/bin`

### `fork/exec /home/.../.localnest: permission denied`

- your MCP `command` is pointing to a directory
- set `command` to `localnest` or `/home/<user>/.pub-cache/bin/localnest`

### `No valid projects found in config`

- `projects[]` is empty, invalid, or paths do not exist for current user
- validate quickly:

```bash
localnest --config
```

- fix by re-running setup with a real path:

```bash
localnest --setup --name prod --root /absolute/path/to/real/project --config /home/<your_username>/.localnest/config.json
```

### Search is slow

- run `--doctor` and install `rg`
- lower scope by targeting a specific project alias

### No results

- check alias with `list_projects`
- verify deny patterns are not filtering paths
- try case-insensitive query (`caseSensitive: false`)

## Dev Commands

```bash
dart format .
dart analyze
dart test
./tool/build_exe.sh
```

## License

MIT (`LICENSE`).
