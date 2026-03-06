# 0.0.2-beta.2 Install

<div className="docPanel docPanel--compact">
  <p>
    This release sits between the earliest `npx`-first workflow and the later stable global-install
    guidance. It adds bundled skill installation but still reflects transitional setup habits.
  </p>
</div>

This beta added a cleaner package install and skill distribution flow.

## Install commands

```bash
npm install -g localnest-mcp@0.0.2-beta.2
localnest-mcp-install-skill
npx -y localnest-mcp-setup
npx -y localnest-mcp-doctor
```

Setup prints a ready-to-paste `mcpServers.localnest` block in this release line.

## Practical notes

- this is the first version where bundled skill install becomes part of the expected workflow
- legacy aliases still exist, so clients may show both old and canonical tool names
- use [/docs/releases/version-selection](/docs/releases/version-selection) to choose another version line
