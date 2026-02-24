# LocalNest MCP (Node.js)

LocalNest MCP exposes local project code to AI agents through a safe, read-only Model Context Protocol server.

## What this solves

- Let agents inspect local codebases without broad filesystem access.
- Keep access restricted to configured root directories.
- Support large workspaces with fast search (`ripgrep`) and project auto-splitting.

## Quick start

1. Install dependencies:
```bash
npm install
```
2. Configure roots:
```bash
npx -y localnest-mcp-setup
```
3. Add MCP config in your client:
```json
{
  "mcpServers": {
    "localnest": {
      "command": "node",
      "args": ["/tmp/localnest-repo/node-mcp/src/localnest-mcp.js"],
      "env": {
        "MCP_MODE": "stdio",
        "LOCALNEST_CONFIG": "/tmp/localnest-repo/node-mcp/localnest.config.json"
      }
    }
  }
}
```
4. Restart MCP client.

## npx usage (after npm publish)

```bash
npx -y localnest-mcp-setup
```

MCP config:
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

## GitHub-only usage (no npm publish)

```bash
npx -y github:wm-jenildgohel/localnest#beta-node localnest-mcp-setup
```

## Configuration

Root resolution priority:
1. `PROJECT_ROOTS` env var
2. `LOCALNEST_CONFIG`
3. Current working directory fallback

### `LOCALNEST_CONFIG` format

```json
{
  "name": "localnest",
  "version": 1,
  "roots": [
    { "label": "flutter", "path": "/mnt/.../Workspace/Flutter" }
  ]
}
```

### Optional env knobs

- `MCP_MODE`: must be `stdio`
- `LOCALNEST_RG_TIMEOUT_MS`: ripgrep timeout (default `15000`)
- `LOCALNEST_AUTO_PROJECT_SPLIT`: `true|false` (default `true`)
- `LOCALNEST_MAX_AUTO_PROJECTS`: max split projects (default `120`)
- `LOCALNEST_EXTRA_PROJECT_MARKERS`: extra marker files (comma-separated)
- `LOCALNEST_FORCE_SPLIT_CHILDREN`: force split workspace by first-level dirs (`true|false`)
- `DISABLE_CONSOLE_OUTPUT`: suppress non-error logs

## Tools

- `server_status`: runtime capabilities and active config summary
- `usage_guide`: recommended workflow for users and agents
- `list_roots`: configured root paths
- `list_projects`: discover projects under a root
- `project_tree`: compact file tree for one project
- `search_code`: fast content search (supports `all_roots`)
- `read_file`: bounded line-window read
- `summarize_project`: high-level project statistics

## Recommended agent flow

1. `server_status`
2. `list_roots`
3. `list_projects`
4. `project_tree`
5. `search_code`
6. `read_file`

This sequence minimizes token noise and improves relevance.

## Performance guidance

- Prefer project-level roots over giant umbrella roots when possible.
- Use `search_code` with `project_path` instead of broad `all_roots`.
- Keep `rg` installed for best performance.
- Use narrow `glob` filters for large repositories.

## Fallbacks for non-standard projects

If auto-splitting misses projects:
- Set `LOCALNEST_EXTRA_PROJECT_MARKERS`.
- Set `LOCALNEST_FORCE_SPLIT_CHILDREN=true`.
- Or pass explicit `project_path` in `search_code`.

## Security model

- Read-only operations only.
- Access restricted to configured roots.
- Ignores common heavy/system directories.
- File-size and line-window limits reduce accidental over-read.

## Development

```bash
npm run check
npm start
```

## Publish

```bash
npm login
npm run check
npm publish
```
