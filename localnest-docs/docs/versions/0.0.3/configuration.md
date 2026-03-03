# 0.0.3 Configuration

<div className="docPanel docPanel--compact">
  <p>
    `0.0.3` is the stable configuration baseline. Use these settings when you want behavior that
    matches the current published npm package rather than unreleased `main` changes.
  </p>
</div>

## Root resolution order

1. `PROJECT_ROOTS`
2. `LOCALNEST_CONFIG`
3. current working directory fallback

## Index settings

| Variable | Default | Description |
| --- | --- | --- |
| `LOCALNEST_INDEX_BACKEND` | `sqlite-vec` | backend selection |
| `LOCALNEST_DB_PATH` | `~/.localnest/localnest.db` | SQLite DB path |
| `LOCALNEST_INDEX_PATH` | `~/.localnest/localnest.index.json` | JSON index path |
| `LOCALNEST_SQLITE_VEC_EXTENSION` | - | custom extension path |
| `LOCALNEST_VECTOR_CHUNK_LINES` | `60` | chunk size |
| `LOCALNEST_VECTOR_CHUNK_OVERLAP` | `15` | chunk overlap |
| `LOCALNEST_VECTOR_MAX_TERMS` | `80` | max terms per chunk |
| `LOCALNEST_VECTOR_MAX_FILES` | `20000` | max files indexed |

## Runtime settings

| Variable | Default | Description |
| --- | --- | --- |
| `LOCALNEST_RG_TIMEOUT_MS` | `15000` | ripgrep timeout |
| `LOCALNEST_AUTO_PROJECT_SPLIT` | `true` | auto project split |
| `LOCALNEST_MAX_AUTO_PROJECTS` | `120` | max discovered projects |
| `LOCALNEST_FORCE_SPLIT_CHILDREN` | `false` | force child split when no markers |

## Release-specific notes

- `0.0.3` documents the stable release line only
- canonical tool names are the public contract in this version
- update-check environment variables belong to unreleased `main`, not this release page
