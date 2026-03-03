# Overview

LocalNest MCP is a local-first MCP server that gives AI agents scoped access to your codebase with optional semantic indexing, hybrid retrieval, and local memory.

## Use this documentation by intent

- [Install and configure LocalNest](./setup/install)
- [Review configuration and env vars](./setup/configuration)
- [Browse tool documentation](./tools/overview)
- [See the current branch package and behavior](./releases/current)
- [See the release matrix](./releases/history)

## Core ideas

- LocalNest only reads from configured roots.
- Lexical search works without indexing; hybrid search benefits from a semantic index.
- Local memory is opt-in and stays on your machine.
- The fastest workflow is usually: find files first, search within them second, read exact lines last.
- Memory results are guidance, not final evidence. Verify with file tools before concluding.
