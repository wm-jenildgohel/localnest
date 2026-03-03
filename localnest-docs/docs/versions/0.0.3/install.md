# 0.0.3 Install

<div className="docPanel docPanel--compact">
  <p>
    This archived install page mirrors the current stable package behavior. Use it when you need
    installation instructions frozen to the `0.0.3` release contract.
  </p>
</div>

## Requirements

- Node.js `>=18`
- `ripgrep` recommended for fastest lexical search

Install ripgrep:

| Platform | Command |
| --- | --- |
| Ubuntu/Debian | `sudo apt-get install ripgrep` |
| macOS | `brew install ripgrep` |
| Windows | `winget install BurntSushi.ripgrep.MSVC` |

## Global install

```bash
npm install -g localnest-mcp
localnest-mcp-install-skill
localnest-mcp-setup
localnest-mcp-doctor
```

## npx fallback

```bash
npx -y localnest-mcp-setup
npx -y localnest-mcp-doctor
```

## MCP client config

`0.0.3` expects a config block like:

```json
{
  "mcpServers": {
    "localnest": {
      "command": "npx",
      "args": ["-y", "localnest-mcp"],
      "startup_timeout_sec": 30,
      "env": {
        "MCP_MODE": "stdio",
        "LOCALNEST_CONFIG": "~/.localnest/localnest.config.json",
        "LOCALNEST_INDEX_BACKEND": "sqlite-vec",
        "LOCALNEST_DB_PATH": "~/.localnest/localnest.db",
        "LOCALNEST_INDEX_PATH": "~/.localnest/localnest.index.json"
      }
    }
  }
}
```

## Notes

- global install is the preferred path in `0.0.3`
- setup writes both `localnest.config.json` and `mcp.localnest.json`
- Windows users should use the generated `npx.cmd` command from setup output
