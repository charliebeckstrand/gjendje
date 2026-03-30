---
'gjendje': minor
---

Add `mutate()` method for zero-copy in-place updates on state instances.

`mutate()` receives the current value by reference, lets you modify it in place, then re-stores the same reference and notifies subscribers. This avoids the object spread cost that `set()` and `patch()` incur when updating large objects (500+ keys).

```ts
const settings = state('settings', { default: largeObj })

// Before: ~1.7M ops/s (copies all keys via spread)
settings.set(prev => ({ ...prev, theme: 'dark' }))

// After: ~14M ops/s (zero-copy, same as raw set())
settings.mutate(draft => { draft.theme = 'dark' })
```

**Key behaviors:**

- **Bypasses `isEqual`** — the reference is the same before and after, so equality would always bail. Calling `mutate()` explicitly signals intent to change.
- **Interceptors still run** — interceptors can transform or reject the mutated value.
- **`prev` and `next` share the same reference** in `onChange` handlers and subscribers.
- Available on both memory-scoped and adapter-backed (local, session, url, etc.) instances.
