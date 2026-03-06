---
slug: /
sidebar_position: 1
title: Getting Started
---

# Getting Started

LocalNest MCP is a local-first MCP server that gives AI agents scoped access to your codebase, with optional semantic indexing, hybrid retrieval, and local memory.

<div className="docHero">
  <div className="docHero__lead">
    <span className="docEyebrow">Documentation</span>
    <h2>Reference-first docs for installing, indexing, searching, and operating LocalNest.</h2>
    <p>
      This site is structured for implementation work. Start with setup, then move into search and
      indexing, and use release notes only when you need version-specific behavior.
    </p>
  </div>
  <div className="docPanel docPanel--compact">
    <div className="docStat">
      <span className="docStat__label">Current beta package</span>
      <strong>0.0.4-beta.5</strong>
    </div>
    <div className="docStat">
      <span className="docStat__label">Preferred backend</span>
      <strong>`sqlite-vec`</strong>
    </div>
    <div className="docStat">
      <span className="docStat__label">Minimum runtime</span>
      <strong>Node.js 18+</strong>
    </div>
  </div>
</div>

## Quick start

If you want the shortest path:

1. Install globally.
2. Run setup.
3. Run doctor.
4. Paste the generated MCP block into your client.

Recommended global install:

```bash
npm install -g localnest-mcp
localnest-mcp-install-skill
localnest setup
localnest doctor
```

Fallback:

```bash
npx -y localnest-mcp-setup
npx -y localnest-mcp-doctor
```

## Choose your path

- New install: start with [Install](/docs/setup/install), then [Configuration](/docs/setup/configuration).
- Daily coding workflow: jump to [Tools](/docs/tools/overview) and [Search](/docs/tools/search).
- Version-specific behavior: use [Current beta release](/docs/releases/current) and [Release matrix](/docs/releases/history).

## What you get

<div className="docGrid docGrid--3">
  <div className="docPanel">
    <h3>Scoped workspace access</h3>
    <p>Browse roots, inspect project trees, and read bounded file ranges without exposing unrelated files.</p>
  </div>
  <div className="docPanel">
    <h3>Fast lexical search</h3>
    <p>Use `localnest_search_files` and `localnest_search_code` for modules, exact symbols, and regex patterns.</p>
  </div>
  <div className="docPanel">
    <h3>Local semantic retrieval</h3>
    <p>Index a project locally, then use hybrid retrieval to answer concept-level questions with better recall.</p>
  </div>
  <div className="docPanel">
    <h3>Durable local memory</h3>
    <p>Enable opt-in memory capture to persist decisions, preferences, and prior fixes on your machine.</p>
  </div>
</div>

## Suggested reading order

<div className="docGrid docGrid--2">
  <a className="docLinkCard" href="./setup/install">
    <strong>Install</strong>
    <span>Set up the package, skill, doctor checks, sync option, and MCP client block.</span>
  </a>
  <a className="docLinkCard" href="./setup/configuration">
    <strong>Configuration</strong>
    <span>Review root resolution, environment variables, and backend settings.</span>
  </a>
  <a className="docLinkCard" href="./tools/overview">
    <strong>Tools</strong>
    <span>See the full tool surface and the intended retrieval workflow.</span>
  </a>
  <a className="docLinkCard" href="./releases/current">
    <strong>Current beta release</strong>
    <span>See the `0.0.4-beta.5` beta behavior, including `localnest upgrade`, setup updates, and memory workflow.</span>
  </a>
  <a className="docLinkCard" href="./releases/history">
    <strong>Release matrix</strong>
    <span>Compare stable and beta docs when you are working across versions.</span>
  </a>
</div>

## Typical workflow

<div className="docSteps">
  <div className="docStep">
    <span>1</span>
    <div>
      <strong>Bootstrap the environment</strong>
      <p>Install the package, run `localnest setup`, opt into memory if needed, then verify with `localnest doctor`.</p>
    </div>
  </div>
  <div className="docStep">
    <span>2</span>
    <div>
      <strong>Wire the MCP client</strong>
      <p>Add the generated `mcpServers.localnest` block and restart the client.</p>
    </div>
  </div>
  <div className="docStep">
    <span>3</span>
    <div>
      <strong>Discover scope</strong>
      <p>Use `localnest_search_files` first when locating a feature, module, or directory.</p>
    </div>
  </div>
  <div className="docStep">
    <span>4</span>
    <div>
      <strong>Recall prior context</strong>
      <p>If memory is enabled, run `localnest_task_context` before deeper analysis so runtime status and relevant memory come back together.</p>
    </div>
  </div>
  <div className="docStep">
    <span>5</span>
    <div>
      <strong>Search with intent</strong>
      <p>Use `localnest_search_code` for exact identifiers and `localnest_search_hybrid` for concept retrieval.</p>
    </div>
  </div>
  <div className="docStep">
    <span>6</span>
    <div>
      <strong>Validate with exact lines</strong>
      <p>Read the relevant file window with `localnest_read_file` before making changes or conclusions.</p>
    </div>
  </div>
</div>
