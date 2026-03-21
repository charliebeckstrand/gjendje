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

After completing a major change, addition, or feature:

1. Run `pnpm changeset` and describe what changed
2. Select the appropriate changeset type (see `.changeset/README.md` for types: `patch`, `minor`, `major`)
3. Commit the generated changeset file alongside the code changes
4. Update `CHANGELOG.md` with a summary of the change

## Agent Behavior

- When busy with a task and the user requests something else, delegate the new task to a sub-agent using the Agent tool rather than interrupting current work.
