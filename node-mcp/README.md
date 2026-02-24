# LocalNest MCP Server (Node.js)

A local, read-only MCP server that lets AI agents inspect your local code projects safely.

## Zero-install UX (npx)

Users can run setup without installation:
```bash
npx -y localnest-mcp-setup
```
If package is not yet published to npm, run from GitHub:
```bash
npx -y github:wm-jenildgohel/localnest#beta-node localnest-mcp-setup
```

If needed, users can pass roots directly:
```bash
npx -y localnest-mcp-setup --paths="/absolute/path1,/absolute/path2"
```

This writes:
- `~/.localnest/localnest.config.json`
- `~/.localnest/mcp.localnest.json`

Then copy `mcpServers.localnest` from `~/.localnest/mcp.localnest.json` into MCP client config.

To generate snippet for a custom package/ref:
```bash
npx -y localnest-mcp-setup --package="github:wm-jenildgohel/localnest#beta-node"
```

## MCP client config (no install)

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

## Local dev setup (repo checkout)

```bash
npm install
npm run setup
npm start
```

## Publish to npm

```bash
npm login
npm run check
npm publish
```

After publish, users can optionally install globally:
```bash
npm i -g localnest-mcp
localnest-mcp-setup
```

## MCP name

This server is registered as `localnest`.

## Official requirements (MCP SDK)

Based on official MCP sources:
- Use the TypeScript/JavaScript SDK package: `@modelcontextprotocol/sdk`
- Include `zod` for tool input schemas
- Use stdio transport for local client integration (`StdioServerTransport`)
- Do not write protocol-irrelevant output to `stdout` (use `stderr` for logs)
- `MCP_MODE=stdio` is enforced for predictable MCP client behavior
- Tools return structured MCP output (`structuredContent`) with schema validation

## Config model

Path roots are loaded in this order:
1. `PROJECT_ROOTS` env var (highest priority)
2. `LOCALNEST_CONFIG` JSON file path (or `./localnest.config.json` by default)
3. Current working directory fallback

`PROJECT_ROOTS` format:
- `label=/absolute/path;label2=/absolute/path2`

`localnest.config.json` format:
```json
{
  "name": "localnest",
  "version": 1,
  "roots": [
    { "label": "work", "path": "/Users/you/work" },
    { "label": "personal", "path": "/Users/you/projects" }
  ]
}
```

## Tools exposed

- `list_roots`: show configured local roots.
- `list_projects`: list first-level project directories.
- `project_tree`: compact tree view for a project.
- `search_code`: text search across project files (`all_roots=true` to scan all configured roots).
- `read_file`: bounded, line-numbered file chunk reader.
- `summarize_project`: quick extension/file distribution summary.

## Performance notes

- `search_code` uses `ripgrep` (`rg`) automatically when available for fast scanning across many projects.
- If `rg` is not installed, it falls back to pure Node.js scanning.
- Tune ripgrep timeout with `LOCALNEST_RG_TIMEOUT_MS` (default `15000`).

## Security model

- Read-only access only.
- Access restricted to configured roots.
- Hidden/system and heavy directories are skipped (`.git`, `node_modules`, `.venv`, etc).
- Per-file read size limit and line-window limits keep responses bounded.

## Notes

- This server is intended for local machines only.
- You can run multiple server instances with different root sets for stricter isolation.
