# Configuration

<div className="docPanel docPanel--compact">
  <p>
    Setup writes a config file for roots and indexing, plus a ready-to-paste MCP client block. Most
    installations only need to change roots or switch index backends. This branch also persists
    memory settings into config and generated MCP snippets.
  </p>
</div>

## Files written by setup

<div className="docGrid docGrid--2">
  <div className="docPanel">
    <h3>`~/.localnest/config/localnest.config.json`</h3>
    <p>Stores configured roots, indexing preferences, and memory settings such as consent and memory DB path.</p>
  </div>
  <div className="docPanel">
    <h3>`~/.localnest/config/mcp.localnest.json`</h3>
    <p>Contains the generated `mcpServers.localnest` block for your MCP client configuration.</p>
  </div>
  <div className="docPanel">
    <h3>`~/.localnest/data/*`</h3>
    <p>Holds the SQLite index, JSON fallback index, and local memory database.</p>
  </div>
</div>

## Config priority

1. `PROJECT_ROOTS`
2. `LOCALNEST_CONFIG`
3. current working directory fallback

## Practical guidance

- Use `PROJECT_ROOTS` when you want a temporary override in CI or a one-off shell session.
- Use `LOCALNEST_CONFIG` when you need to point the server at a non-default config file.
- Keep `LOCALNEST_INDEX_BACKEND` aligned with the Node runtime available to your MCP client.
- Leave memory backend on `auto` unless you are debugging backend selection.

## Key environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `LOCALNEST_INDEX_BACKEND` | `sqlite-vec` | index backend |
| `LOCALNEST_DB_PATH` | `~/.localnest/data/localnest.db` | SQLite DB path |
| `LOCALNEST_INDEX_PATH` | `~/.localnest/data/localnest.index.json` | JSON index path |
| `LOCALNEST_VECTOR_CHUNK_LINES` | `60` | chunk size |
| `LOCALNEST_VECTOR_CHUNK_OVERLAP` | `15` | chunk overlap |
| `LOCALNEST_VECTOR_MAX_TERMS` | `80` | max terms per chunk |
| `LOCALNEST_VECTOR_MAX_FILES` | `20000` | max files per index run |
| `LOCALNEST_MEMORY_ENABLED` | `false` | enable local memory subsystem |
| `LOCALNEST_MEMORY_BACKEND` | `auto` | memory backend selection |
| `LOCALNEST_MEMORY_DB_PATH` | `~/.localnest/data/localnest.memory.db` | SQLite memory DB path |
| `LOCALNEST_MEMORY_AUTO_CAPTURE` | `false` | background memory capture behavior |
| `LOCALNEST_MEMORY_CONSENT_DONE` | `false` | whether setup already collected memory consent |
| `LOCALNEST_UPDATE_PACKAGE` | `localnest-mcp` | package checked for updates |
| `LOCALNEST_UPDATE_CHECK_INTERVAL_MINUTES` | `120` | update check cache interval |
| `LOCALNEST_UPDATE_FAILURE_BACKOFF_MINUTES` | `15` | retry backoff after failures |

## Config schema notes

- Setup now writes config schema `version: 3`.
- Existing configs and the older flat `.localnest` layout are auto-migrated on startup, with timestamped backups stored under `~/.localnest/backups/`.
- Memory remains disabled unless the user opted in during setup or explicitly enables it via environment variables.
