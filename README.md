# LocalNest

LocalNest is a local MCP server for code context.

It lets AI tools search your local projects safely using a simple flow:

1. find projects
2. search code
3. fetch exact snippets

## Quick Start

## 1) Build

```bash
cd localnest
./tool/build_exe.sh
```

## 2) Setup

Single root:

```bash
./build/localnest --setup --name scripts --root /absolute/path/to/Scripts
```

Large parent root (recommended): split into many project aliases:

```bash
./build/localnest --setup --name flutter --root /absolute/path/to/Flutter --split-projects
```

Optional vector placeholders in config:

```bash
./build/localnest --setup --name flutter --root /absolute/path/to/Flutter --split-projects --enable-vector-bootstrap
```

## 3) Health Check

```bash
./build/localnest --doctor
```

## 4) Add to MCP config

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

## 5) Run

```bash
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
| `--setup` | Create/update config and add project |
| `--split-projects` | Discover subprojects under root |
| `--enable-vector-bootstrap` | Add vector config placeholders |
| `--doctor` | Check `dart`, `git`, `rg` and show install hints |
| `--config <path>` | Use explicit config file |

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
