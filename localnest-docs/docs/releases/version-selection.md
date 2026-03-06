---
description: Choose the correct LocalNest version line with explicit install commands for current beta, stable, and archived beta releases.
---

# Version Selection

Use this page to choose a LocalNest version line and install it explicitly.

## Recommended defaults

- Want latest beta features: use `0.0.4-beta.5`
- Want stable behavior: use `0.0.3`
- Need older behavior for compatibility: use the archived beta rows below

## Install commands by version

| Version | Channel | Install command |
| --- | --- | --- |
| `0.0.4-beta.5` | current beta | `npm install -g localnest-mcp@0.0.4-beta.5` |
| `0.0.4-beta.4` | archived beta | `npm install -g localnest-mcp@0.0.4-beta.4` |
| `0.0.3` | stable | `npm install -g localnest-mcp@0.0.3` |
| `0.0.2-beta.3` | archived beta | `npm install -g localnest-mcp@0.0.2-beta.3` |
| `0.0.2-beta.2` | archived beta | `npm install -g localnest-mcp@0.0.2-beta.2` |
| `0.0.1-beta.1` | archived beta | `npm install -g localnest-mcp@0.0.1-beta.1` |

## Post-install command differences

| Version | `localnest-mcp-install-skill` | Setup style |
| --- | --- | --- |
| `0.0.4-beta.5` | yes | global-first + `localnest upgrade` command path |
| `0.0.4-beta.4` | yes | global-first + memory consent |
| `0.0.3` | yes | global-first |
| `0.0.2-beta.3` | yes | transitional (`npm -g` + `npx` setup common) |
| `0.0.2-beta.2` | yes (introduced here) | transitional |
| `0.0.1-beta.1` | no | `npx`-first setup flow |

## Notes

- If you need deterministic behavior across environments, pin exact versions instead of using floating tags.
- The phrase "beta 5.0.0" in this repo usually maps to `0.0.4-beta.5` package naming.
- Use [Release Matrix](./history) for context and [Current Beta Release](./current) for active beta behavior.
