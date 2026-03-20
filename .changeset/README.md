# Changesets

This directory is managed by [Changesets](https://github.com/changesets/changesets).

## Releasing a change

1. Make your changes
2. Run `pnpm changeset` and describe what changed
3. Commit the generated changeset file alongside your code changes
4. When the PR is merged to `main`, the release workflow creates a "Version Packages" PR
5. Merging that PR publishes to npm automatically

## Changeset types

- `patch` — bug fixes, docs, internal refactors
- `minor` — new features, new exports (backwards compatible)
- `major` — breaking changes
