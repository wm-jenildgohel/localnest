# Code Standards

These standards align with current Node.js backend best practices used in this repository.

## Runtime and Modules

- Target Node.js `>=18` (see `package.json` engines).
- Use ESM (`import`/`export`) consistently.
- Avoid synchronous filesystem APIs in runtime paths.

## File and Module Design

- Prefer small focused modules with a single responsibility.
- Keep framework/tool registration separate from domain logic.
- Put reusable logic in `src/services`; keep `bin/` and `scripts/` minimal wrappers.

## Error Handling

- Throw structured errors from services when possible.
- Handle and log failures at process boundaries with actionable context.
- Preserve non-fatal fallback behavior (for example optional backend fallback).

## MCP Tool Conventions

- Use canonical `localnest_*` tool naming.
- Define input schemas in Zod and validate at registration time.
- Keep tool handlers deterministic and serialization-safe.
- Annotate tools correctly (`readOnlyHint`, `destructiveHint`, `idempotentHint`).

## Tests and Quality Gates

- Add/adjust tests in `test/` for behavior changes.
- Run at minimum:
  - `npm run check`
  - `npm run lint`
  - `npm test`
- Run `npm run quality` before release-level changes.

## Documentation Rules

- Product usage belongs in root `README.md`.
- Contributor standards belong in `guides/`.
- User-facing guides for the docs site belong in `localnest-docs/`.
- Update docs in the same PR as behavioral changes.

