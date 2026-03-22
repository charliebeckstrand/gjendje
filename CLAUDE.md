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

After completing a change, addition, or feature:

1. Run `pnpm changeset` and describe what changed
2. Select the appropriate changeset type based on the scope of the change (see `.changeset/README.md` for types)
3. Commit the generated changeset file alongside the code changes
4. Update `CHANGELOG.md` with a summary of the change

### Versioning

- **Minor changes** (bug fixes, docs, refactors) bump by `0.0.x` — use changeset type `patch`
- **Major changes** (new features, new exports, breaking changes) bump by `0.x` — use changeset type `minor` or `major`

## Deprecations (remove in 1.0.0)

The following exports are deprecated and should be removed when releasing 1.0.0:

- **`local()`** — standalone scope shortcut. Use `state.local()` instead. (deprecated in 0.7.0)
- **`session()`** — standalone scope shortcut. Use `state.session()` instead. (deprecated in 0.7.0)
- **`url()`** — standalone scope shortcut. Use `state.url()` instead. (deprecated in 0.7.0)
- **`bucket()`** — standalone scope shortcut. Use `state.bucket()` instead. (deprecated in 0.7.0)
- **`server()`** — standalone scope shortcut. Use `state.server()` instead. (deprecated in 0.7.0)

When preparing 1.0.0:
1. Remove the deprecated standalone functions from `src/shortcuts.ts`
2. Remove their re-exports from `src/index.ts`
3. Remove the `_deprecationWarned` set and `warnDeprecated` helper
4. Update tests that use the standalone imports to use `state.*` instead

## Agent Behavior

- When busy with a task and the user requests something else, delegate the new task to a sub-agent using the Agent tool rather than interrupting current work.
