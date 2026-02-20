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

Large parent root (recommended): split into project aliases:

```bash
localnest --setup --name flutter --root /absolute/path/to/Flutter --split-projects
```

Optional vector placeholders:

```bash
localnest --setup --name flutter --root /absolute/path/to/Flutter --split-projects --enable-vector-bootstrap
```

## 3) Health check

```bash
localnest --doctor
```

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

```json
{
  "mcpServers": {
    "localnest": {
      "command": "localnest",
      "args": [
        "--config",
        "/absolute/path/to/localnest.config.json"
      ]
    }
  }
}
```

## Production Configuration (Required)

Use this exact structure in production.

Valid MCP block:

```json
{
  "mcpServers": {
    "localnest": {
      "command": "/home/wmt-tushar/.pub-cache/bin/localnest",
      "args": [
        "--config",
        "/home/wmt-tushar/.localnest/config.json"
      ]
    }
  }
}
```

Do not do this:

```json
{
  "mcpServers": {
    "localnest": {
      "command": "/home/wmt-tushar/.localnest"
    }
  }
}
```

Reason: `command` must be an executable, not a directory.

Required config file (`/home/wmt-tushar/.localnest/config.json`) example:

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
| `--setup` | Create/update config (defaults to current directory) |
| `--split-projects` | Discover subprojects under root |
| `--enable-vector-bootstrap` | Add vector config placeholders |
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

## Security Defaults

- read-only tools only
- path traversal blocked
- deny-pattern filtering
- root paths hidden by default
- MCP frame size guards

## Performance Tips

1. Use `--split-projects` for large directories.
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
localnest --setup --name prod --root /absolute/path/to/real/project --config /home/wmt-tushar/.localnest/config.json
```

### Search is slow

- run `--doctor` and install `rg`
- split projects instead of one huge root
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
