# CLAUDE.md

## Code Style & Linting

This project uses **Biome** for linting and formatting. Run `pnpm lint` to check and `pnpm lint:fix` to auto-fix.

### Formatting rules

- Use **tabs** for indentation
- Line width: **100** characters
- **Single quotes**, trailing commas everywhere, semicolons only as needed

### Linting rules to follow strictly

- Never use non-null assertions (`!` operator) — `noNonNullAssertion`
- Never use `any` explicitly — `noExplicitAny`
- Never leave unused variables — `noUnusedVariables` (error)
- Always use `const` when a variable is never reassigned — `useConst` (error)
- Always include all dependencies in React hook dependency arrays — `useExhaustiveDependencies`
- Biome's recommended rules are also enabled

## Changesets & Changelog

The Changesets release action automatically generates `CHANGELOG.md` entries from changeset files. **Do not edit `CHANGELOG.md` manually** — write detailed descriptions in the changeset file instead.

After completing a change, addition, or feature:

1. Run `pnpm changeset` and select the appropriate type (`patch`, `minor`, or `major`)
2. Write a **detailed** description in the generated `.changeset/*.md` file — full markdown is supported (code blocks, lists, bold, etc.). This becomes the changelog entry verbatim.
3. Commit the changeset file alongside the code changes

When the branch is merged to `main`, the Changesets GitHub Action creates a "Version Packages" PR that bumps the version, generates the changelog entry, and deletes the consumed changeset file. Merging that PR publishes to npm.

### Versioning

- **Minor changes** (bug fixes, docs, refactors) bump by `0.0.x` — use changeset type `patch`
- **Major changes** (new features, new exports, breaking changes) bump by `0.x` — use changeset type `minor` or `major`

## Deprecations

**Before every major version release**, review [docs/deprecations.md](docs/deprecations.md) and remove all deprecated APIs targeted for that release. This is a required step — never ship a major version without checking the deprecations list first.

## Code Quality

Never commit without ensuring new code matches these quality guidelines:

- Run `pnpm lint` (and fix any issues with `pnpm lint:fix`) before committing
- Run `pnpm test` and ensure all tests pass before committing
- Follow the formatting and linting rules listed above
- Add blank lines between consecutive variable declarations (`const`/`let`) — each declaration should be visually separated
- New features must include tests

## Performance-Critical Architecture

### MemoryStateImpl (src/core.ts)

**Do not remove, flatten, or merge `MemoryStateImpl` into `StateImpl`.**

`MemoryStateImpl` is a specialized subclass that bypasses the adapter pipeline for memory-scoped state (the default and most common scope). It stores values directly on the instance instead of going through adapter `get()`/`set()` indirection. Removing it causes a **~60% regression** in instance lifecycle throughput and **~30% regression** in batch/effect performance.

Run `npx tsx benchmarks/internal.bench.ts lifecycle batch-scaling effect` to verify performance before and after any changes to this class.

## Agent Behavior

- When busy with a task and the user requests something else, delegate the new task to a sub-agent using the Agent tool rather than interrupting current work.
