## 0.1.0

- Initial LocalNest MCP stdio server implementation
- Added local-only retrieval tools (`list_projects`, `search_code`, `get_file_snippet`, `get_repo_structure`)
- Added root allowlisting, deny patterns, and hidden-root default
- Added SOLID and security documentation
- Added bounded parallel search (`maxConcurrentSearches`)
- Added in-memory search cache (`searchCacheTtlSeconds`, `searchCacheMaxEntries`)
- Added broad-root guard (`allowBroadRoots: false` default)
- Added native binary build script (`tool/build_exe.sh`)
- Added CLI setup command (`--setup --name --root [--config]`) for one-step local setup
- Added environment doctor command (`--doctor`) with rg install hints
- Added search fallback chain when rg is missing: `git grep` then bounded Dart scan
- Added search timeout control (`searchTimeoutMs`) and MCP frame size guards
