# 0.0.4-beta.4 Install

<div className="docPanel docPanel--compact">
  <p>
    Installation is the same base flow as stable, with beta docs emphasizing memory consent and
    version-aware skill sync behavior.
  </p>
</div>

```bash
npm install -g localnest-mcp@0.0.4-beta.4
localnest-mcp-install-skill
localnest-mcp-setup
localnest-mcp-doctor
```

## Beta-specific notes

- `localnest-mcp-setup` includes one-time memory consent prompts.
- Generated MCP snippets include memory env vars when enabled.
- `localnest-mcp-install-skill` skips reinstall when installed skill is already current.

Need another version line? Use [/docs/releases/version-selection](/docs/releases/version-selection).
