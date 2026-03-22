# Deprecations

Deprecated APIs scheduled for removal. **Before every major version release**, review this entire list and remove all items targeted for that release. Do not ship a major version without completing the removal steps for each applicable entry.

---

## Remove with next major version

### Standalone scope shortcut exports

**Deprecated in:** 0.7.0
**Replacement:** `state.local()`, `state.session()`, `state.url()`, `state.bucket()`, `state.server()`

The following standalone exports now emit a console deprecation warning on first use:

| Deprecated export | Replacement |
|-------------------|-------------|
| `local()` | `state.local()` |
| `session()` | `state.session()` |
| `url()` | `state.url()` |
| `bucket()` | `state.bucket()` |
| `server()` | `state.server()` |

**Migration for users:**

```diff
- import { local, session, url, bucket, server } from 'gjendje'
+ import { state } from 'gjendje'

- const theme = local({ theme: 'light' })
+ const theme = state.local({ theme: 'light' })

- const draft = session({ draft: '' })
+ const draft = state.session({ draft: '' })

- const filters = url({ q: '' })
+ const filters = state.url({ q: '' })

- const cache = bucket({ cache: [] }, { bucket: { name: 'app-cache' } })
+ const cache = state.bucket({ cache: [] }, { bucket: { name: 'app-cache' } })

- const user = server({ user: null })
+ const user = state.server({ user: null })
```

**Removal steps:**

1. Remove the deprecated standalone functions (`local`, `session`, `url`, `server`, `bucket`) from `src/shortcuts.ts`
2. Remove their re-exports from `src/index.ts`
3. Remove the `_deprecationWarned` set and `warnDeprecated` helper from `src/shortcuts.ts`
4. Update tests in `__tests__/shortcuts-api.test.ts` to use `state.local()` etc. instead of standalone imports

---

### `tab` scope name

**Deprecated in:** 0.7.0
**Replacement:** `session`

The `tab` scope is an alias for `session`. Both resolve to the same `sessionStorage` backend. `session` is now the preferred name.

**Migration for users:**

```diff
- state({ draft: '' }, { scope: 'tab' })
+ state({ draft: '' }, { scope: 'session' })
```

**Removal steps:**

1. Remove `'tab'` from the `Scope` type in `src/types.ts`
2. Remove the `'tab'` case from `resolveAdapter` switch in `src/core.ts`
3. Remove `rawScope === 'session' ? 'tab' : rawScope` normalization from `src/factory.ts` and `src/core.ts` — `session` should be used directly instead of normalizing to `tab`
4. Rename internal references from `tab` to `session` (scope sets, adapter resolution, registry keys)
5. Remove `'tab'` from `BucketOptions.fallback` type in `src/types.ts`
6. Update tests that use `scope: 'tab'` to use `scope: 'session'`
