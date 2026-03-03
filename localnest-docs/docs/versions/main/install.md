# main Install

<div className="docPanel docPanel--compact">
  <p>
    The installation flow stays aligned with `0.0.3`, but operational guidance on `main` assumes the
    newer update-aware tooling and the non-fatal ripgrep fallback behavior.
  </p>
</div>

The install flow is the same as `0.0.3`:

```bash
npm install -g localnest-mcp
localnest-mcp-install-skill
localnest-mcp-setup
localnest-mcp-doctor
```

## Main-specific operational note

Agents can check for newer versions and request approval to self-update once these main-branch changes are released.

## Practical difference from 0.0.3

- setup flow is the same
- runtime guidance expects `localnest_update_status` to be called regularly
- missing `rg` is handled as a startup warning with JS fallback rather than a fatal hard stop
