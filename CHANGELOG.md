## 0.1.0-beta.2

### Flow & Interface improvements
- Updated `localnest --setup` to be fully interactive when omitting directory shortcuts
- Improved setup MCP snippet generation to explicitly use absolute paths, resolving GUI integration failures
- Changed `splitProjects` and `enableVectorBootstrap` settings to be enabled by default
- Clarified vector features as future placeholders requiring zero dependencies in current milestone

## 0.1.0-beta.1

### Features
- Initial LocalNest MCP stdio server implementation
- Added local-only retrieval tools (`list_projects`, `search_code`, `get_file_snippet`, `get_repo_structure`)
- Added CLI setup command (`--setup --name --root [--config]`) for one-step local setup
- Added environment doctor command (`--doctor`) with `rg` install hints
- Added native binary build script (`tool/build_exe.sh`)
- Added setup flags for project sharding (`--split-projects` now default)
- Added vector bootstrap config templates as placeholders for future milestone features

### Resiliency & Configuration
- Added root allowlisting, deny patterns, and hidden-root default
- Added search fallback chain when `rg` is missing: `git grep` then bounded Dart scan
- Added bounded parallel search (`maxConcurrentSearches`)
- Added in-memory search cache (`searchCacheTtlSeconds`, `searchCacheMaxEntries`)
- Added broad-root guard (`allowBroadRoots: false` default)
- Added search timeout control (`searchTimeoutMs`) and MCP frame size guards
- Improved search resilience with deadline-aware partial results and fallback chain hardening

### Documentation
- Added SOLID and security documentation
- Marked package/server version as beta prerelease
