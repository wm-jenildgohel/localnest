# Overview

LocalNest MCP is a local-first MCP server that gives AI agents scoped, read-only access to your codebase with optional semantic indexing and hybrid retrieval.

## Use this documentation by intent

- [Install and configure LocalNest](./setup/install)
- [Review configuration and env vars](./setup/configuration)
- [Browse tool documentation](./tools/overview)
- [See the current published release](./releases/current)
- [See the release matrix](./releases/history)

## Core ideas

- LocalNest only reads from configured roots.
- Lexical search works without indexing; hybrid search benefits from a semantic index.
- The fastest workflow is usually: find files first, search within them second, read exact lines last.
- Stable releases expose canonical `localnest_*` tool names only.
