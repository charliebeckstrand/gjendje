# Deprecations

Deprecated APIs scheduled for removal. **Before every major version release**, review this entire list and remove all items targeted for that release. Do not ship a major version without completing the removal steps for each applicable entry.

---

## Removed in 1.0.0

### Standalone scope shortcut exports

**Deprecated in:** 0.7.0
**Removed in:** 1.0.0

The standalone `local()`, `session()`, `url()`, `bucket()`, and `server()` exports have been removed. Use `state.local()`, `state.session()`, `state.url()`, `state.bucket()`, and `state.server()` instead.

---

### `tab` scope name

**Deprecated in:** 0.7.0
**Removed in:** 1.0.0

The `tab` scope alias has been removed. Use `session` instead — both referenced `sessionStorage`.

---

## Deprecated (not yet removed)

### `render` scope name

**Deprecated in:** 1.0.0

The `render` scope name is deprecated in favor of `memory`. Both still work — `'render'` is silently normalized to `'memory'` — but new code should use `'memory'`. The `'render'` alias will be removed in a future major version.
