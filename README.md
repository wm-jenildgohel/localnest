# LocalNest MCP (Node.js)

LocalNest is a local, read-only MCP server that lets AI tools inspect code in your selected project roots.

## Requirements

- Node.js `>=18`
- `npm` / `npx`
- `ripgrep` (`rg`) required

Install `ripgrep`:
- Ubuntu/Debian: `sudo apt-get install ripgrep`
- macOS (Homebrew): `brew install ripgrep`
- Windows (winget): `winget install BurntSushi.ripgrep.MSVC`
- Windows (choco): `choco install ripgrep`

## Why `rg` Is Required

`localnest-mcp` is optimized for large multi-project workspaces. `ripgrep` is required because:
- `search_code` depends on `rg` for fast indexed line search across many folders.
- Without `rg`, search becomes significantly slower and less reliable for large repositories.
- The server and setup intentionally fail fast when `rg` is missing, so users get explicit setup errors instead of degraded behavior.

## Quick Start (No Global Install)

1. Run setup:
```bash
npx -y localnest-mcp-setup
```

2. Run doctor:
```bash
npx -y localnest-mcp-doctor
```

3. Copy `mcpServers.localnest` from `~/.localnest/mcp.localnest.json` into your MCP client config.

4. Restart your MCP client.

Setup writes:
- `~/.localnest/localnest.config.json`
- `~/.localnest/mcp.localnest.json`

## Local Dev (This Repo)

```bash
npm install
npm run setup
npm run doctor
npm start
```

## MCP Config Example

```json
{
  "mcpServers": {
    "localnest": {
      "command": "npx",
      "args": ["-y", "localnest-mcp"],
      "env": {
        "MCP_MODE": "stdio",
        "LOCALNEST_CONFIG": "/Users/you/.localnest/localnest.config.json"
      }
    }
  }
}
```

Windows note:
- setup auto-generates `npx.cmd` in `mcp.localnest.json`.

## Commands

- `localnest-mcp`: starts MCP server via stdio
- `localnest-mcp-setup`: interactive root setup
- `localnest-mcp-doctor`: validates environment/config

From repo:
- `npm run setup`
- `npm run doctor`
- `npm run check`

## Publish

Beta:
```bash
npm login
npm run check
npm run release:beta
```

Stable:
```bash
npm run release:latest
```

Pack test:
```bash
npm pack --dry-run
```

## Config Priority

1. `PROJECT_ROOTS` env var
2. `LOCALNEST_CONFIG` file
3. current working directory fallback

## Tools Exposed

- `server_status`
- `usage_guide`
- `list_roots`
- `list_projects`
- `project_tree`
- `search_code`
- `read_file`
- `summarize_project`
