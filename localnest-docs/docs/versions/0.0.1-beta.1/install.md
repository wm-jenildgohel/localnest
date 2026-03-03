# 0.0.1-beta.1 Install

<div className="docPanel docPanel--compact">
  <p>
    Installation in the first beta is notably rougher than later releases: `npx` is central,
    ripgrep is treated as required, and the global-install-first guidance is not yet established.
  </p>
</div>

## Setup flow

```bash
npx -y localnest-mcp-setup
npx -y localnest-mcp-doctor
```

## Behavior notes

- setup validates Node, npx, and ripgrep before writing config
- setup generates `npx.cmd` on Windows and `npx` on Linux/macOS
- setup asks users to choose the index backend
- global-install-first guidance had not stabilized yet in this version
