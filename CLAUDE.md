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
- Add blank lines between **logically unrelated** variable declaration groups — related declarations can stay together, but a new "kind" of variable starts a new group. For example, state instances are one group, listeners/mocks are another, derived instances (computed, select, readonly) are another. See examples below.
- New features must include tests

### Variable grouping examples

```typescript
// GOOD — state instances grouped, then blank line, then listeners
const a = state('a', { default: 0 })
const b = state('b', { default: 0 })

const listenerA = vi.fn()
const listenerB = vi.fn()

// GOOD — source state, blank line, derived instance, blank line, mock
const base = state('x', { default: 0, scope: 'memory' })

const derived = computed([base], ([v]) => (v ?? 0) * 2)

const listener = vi.fn()

// BAD — everything crammed together with no visual separation
const base = state('x', { default: 0, scope: 'memory' })
const derived = computed([base], ([v]) => (v ?? 0) * 2)
const listener = vi.fn()
```

## Performance-Critical Architecture

### MemoryStateImpl (src/core.ts)

**Do not remove, flatten, or merge `MemoryStateImpl` into `StateImpl`.**

`MemoryStateImpl` is a specialized subclass that bypasses the adapter pipeline for memory-scoped state (the default and most common scope). It stores values directly on the instance instead of going through adapter `get()`/`set()` indirection. Removing it causes a **~60% regression** in instance lifecycle throughput and **~30% regression** in batch/effect performance.

Run `npx tsx benchmarks/internal.bench.ts lifecycle batch-scaling effect` to verify performance before and after any changes to this class.

## Audits

Audit reports live in [`docs/audits/`](docs/audits/). Each file is named by date (e.g. `2025-03-27.md`) and contains findings grouped by severity with checkboxes tracking resolution.

**Before performing a new audit**, read all existing files in `docs/audits/` to:

1. Avoid re-reporting issues that are already tracked
2. Prioritize unresolved items (unchecked boxes) from prior audits before looking for new issues
3. Append new findings to a new dated file — never edit prior audit files except to check off resolved items

## Agent Behavior

- When busy with a task and the user requests something else, delegate the new task to a sub-agent using the Agent tool rather than interrupting current work.
- **When spawning sub-agents that write code or tests**, always include the formatting rules from "Code Quality" and "Variable grouping examples" sections in the agent prompt. Sub-agents do not automatically read CLAUDE.md — the rules must be passed explicitly in the prompt. At minimum, include: "Add blank lines between logically unrelated variable declaration groups (e.g., state instances vs listeners/mocks, source state vs derived state). Related declarations of the same kind stay together."

### Mandatory review before commit

**Every file changed or created — whether by the main agent or a sub-agent — MUST be reviewed for variable grouping violations before committing.** This is not optional. Biome cannot enforce this rule; it requires manual inspection.

Review checklist (read each changed file and verify):

1. **Blank line between logically unrelated groups** — declarations, assignments, assertions, and teardown calls that belong to different "kinds" must be separated by a blank line. Examples of distinct groups:
   - State instances vs derived instances (computed, select, readonly)
   - Mocks/spies (`vi.fn()`, `vi.spyOn()`) vs state instances
   - Assertions (`expect(...)`) vs teardown (`destroy()`, `stop()`, `mockRestore()`)
   - Spy restoration (`mockRestore()`) vs instance cleanup (`destroy()`, `stop()`)
2. **Related declarations of the same kind stay together** — no unnecessary blank lines within a single logical group.

If a sub-agent produced code that violates these rules, **fix the violations before committing** — do not commit first and fix later.
