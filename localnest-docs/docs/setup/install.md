# Install

<div className="docPanel docPanel--compact">
  <p>
    The recommended path is a global install followed by setup and doctor. Use the generated MCP
    config block instead of hand-writing the client command when possible. On this branch, setup also
    collects one-time consent for optional local memory.
  </p>
</div>

## Requirements

- Node.js `>=18`
- `ripgrep` (`rg`) recommended for best lexical search performance
- Node.js `>=22` if you want the local memory subsystem available

## Recommended install

```bash
npm install -g localnest-mcp
localnest-mcp-install-skill
localnest setup
localnest doctor
localnest upgrade
```

## Fallback

```bash
npx -y localnest-mcp-setup
npx -y localnest-mcp-doctor
```

## Install sequence

<div className="docSteps">
  <div className="docStep">
    <span>1</span>
    <div>
      <strong>Install the package</strong>
      <p>Use `npm install -g localnest-mcp` so setup, doctor, and skill commands are available directly.</p>
    </div>
  </div>
  <div className="docStep">
    <span>2</span>
    <div>
      <strong>Install the bundled skill</strong>
      <p>Run `localnest-mcp-install-skill` to sync the shipped agent skill into the local skills directory.</p>
    </div>
  </div>
  <div className="docStep">
    <span>3</span>
    <div>
      <strong>Generate configuration</strong>
      <p>`localnest setup` writes both the LocalNest config and the MCP client block, and prompts once for memory consent.</p>
    </div>
  </div>
  <div className="docStep">
    <span>4</span>
    <div>
      <strong>Verify the environment</strong>
      <p>`localnest doctor` confirms runtime dependencies and flags configuration problems early.</p>
    </div>
  </div>
  <div className="docStep">
    <span>5</span>
    <div>
      <strong>Upgrade when needed</strong>
      <p>Run `localnest upgrade` to pull the latest package and apply setup migrations.</p>
    </div>
  </div>
</div>

## MCP client config

After setup, copy `~/.localnest/config/mcp.localnest.json` into your MCP client configuration.

```json
{
  "mcpServers": {
    "localnest": {
      "command": "npx",
      "args": ["-y", "localnest-mcp"],
      "startup_timeout_sec": 30,
      "env": {
        "MCP_MODE": "stdio",
        "LOCALNEST_CONFIG": "~/.localnest/config/localnest.config.json",
        "LOCALNEST_INDEX_BACKEND": "sqlite-vec",
        "LOCALNEST_DB_PATH": "~/.localnest/data/localnest.db",
        "LOCALNEST_INDEX_PATH": "~/.localnest/data/localnest.index.json",
        "LOCALNEST_MEMORY_ENABLED": "true",
        "LOCALNEST_MEMORY_BACKEND": "auto",
        "LOCALNEST_MEMORY_DB_PATH": "~/.localnest/data/localnest.memory.db"
      }
    }
  }
}
```

## Notes

- Keep `startup_timeout_sec` at `30` or higher if your MCP client is aggressive about startup timeouts.
- Setup writes the correct command for the host platform; Windows installs should prefer the generated file output directly.
- If `sqlite-vec` is unavailable, LocalNest can still run with the JSON backend.
- Memory is opt-in. On Node 18/20, the rest of LocalNest still works, but memory remains unavailable.
- `localnest-mcp-install-skill` is version-aware on this branch and skips reinstalling when the bundled skill is already current.
