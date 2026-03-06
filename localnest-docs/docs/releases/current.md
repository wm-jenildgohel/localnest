---
description: Current beta branch notes for localnest-mcp, including memory workflows, setup changes, and canonical tool behavior.
---

# Current Beta Release

Current beta branch documentation for `localnest-mcp`, covering memory workflow tools, setup migration behavior, and the active canonical `localnest_*` tool contract.

<div className="docGrid docGrid--3">
  <div className="docPanel">
    <span className="docEyebrow">Channel</span>
    <h3>Beta release line</h3>
    <p>Use this page when you need docs that match the currently published beta package behavior.</p>
  </div>
  <div className="docPanel">
    <span className="docEyebrow">Package</span>
    <h3>beta branch track</h3>
    <p>Use versioned pages for published package specifics; this page tracks current branch behavior.</p>
  </div>
  <div className="docPanel">
    <span className="docEyebrow">Docs contract</span>
    <h3>Retrieval + memory workflow</h3>
    <p>The current beta docs include the full memory tool surface and setup/config changes.</p>
  </div>
</div>

## What it includes

- canonical `localnest_*` tool names
- lexical, semantic, and hybrid retrieval
- opt-in local memory tools plus high-level task-context and capture-outcome workflow
- bundled install skill command
- version-aware skill sync behavior
- setup-time memory consent and config migration
- `localnest` top-level CLI command path (`setup`, `doctor`, `upgrade`)

## What changed in `0.0.4-beta.5`

- Added top-level `localnest upgrade` subcommand as the canonical upgrade path.
- Updated setup/docs guidance to prefer top-level `localnest` command usage.
- Improved upgrade validation with clearer user-facing error reporting.
- Removed deprecated `localnest update` alias.
- Removed experimental backup sync CLI + Google Drive integration from the package.

## How to use this page

- Treat this page as the source of truth for the current beta release behavior.
- Use the archived `0.0.3` pages when you need the last stable release contract.
- If you need explicit install commands per version, use [Version Selection](./version-selection).

## Version Source

This page is based on the current beta package version and maintained changelog in the repository.

- package version: `0.0.4-beta.5`
- release date: `2026-03-05`
- changelog sections document beta changes merged into this branch
- stable published release docs remain archived under `0.0.3`
