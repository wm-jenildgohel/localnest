---
description: Version matrix for LocalNest docs mapping current beta, stable release, and archived changelog pages for compatibility and debugging.
---

# Release Matrix

<div className="docPanel docPanel--compact">
  <p>
    Release history here is derived from the maintained changelog and current package metadata. The
    local Git tags in this repository do not currently align with the documented release line.
  </p>
</div>

This site documents versions from repository source history, primarily the maintained `CHANGELOG.md` plus the current package version.

## Important Mismatch

The local git tags currently available in this repository are:

- `v0.1.0-beta`
- `v0.1.0-beta.1`

Those do **not** match the package/changelog release line currently documented here:

- `0.0.4-beta.5` (current beta package)
- `0.0.4-beta.4` (archived beta package)
- `0.0.1-beta.1`
- `0.0.2-beta.2`
- `0.0.2-beta.3`
- `0.0.3`

## Documented Release Pages

| Version | Basis | Page |
| --- | --- | --- |
| `0.0.4-beta.5` | current beta package + changelog `0.0.4-beta.5` | [Current Beta Release](./current) |
| `0.0.4-beta.4` (archive) | frozen docs snapshot | [Version Archive: 0.0.4-beta.4](/docs/versions/0.0.4-beta.4/overview) |
| `0.0.3` | package version + changelog | [0.0.3](./0.0.3) |
| `0.0.2-beta.3` | changelog | [0.0.2-beta.3](./0.0.2-beta.3) |
| `0.0.2-beta.2` | changelog | [0.0.2-beta.2](./0.0.2-beta.2) |
| `0.0.1-beta.1` | changelog | [0.0.1-beta.1](./0.0.1-beta.1) |

Use the per-version pages below for release-specific summaries.

## Reading guidance

- Start with [Version Selection](./version-selection) when you need exact install commands for a specific version.
- Use `current` if you want documentation aligned to the active beta package and behavior.
- Use archived version pages when you are debugging or supporting older installs.
