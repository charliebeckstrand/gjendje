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
