# Engineering TODO

Near-term engineering tasks and API proposals. For longer-term product and community goals, see [roadmap.md](roadmap.md).

---

## ~~`render` scope — add runtime deprecation warning~~ ✅ Done

~~The `'render'` scope is silently normalized to `'memory'` (deprecated in 1.0.0, see [deprecations.md](deprecations.md)). Currently there is no runtime feedback — users won't know they're using a deprecated alias. Add a `console.warn` on first use so they can migrate before removal in the next major version.~~

---

## ~~`mutate()` — zero-copy update for large objects~~ ✅ Done

### Problem

Updating a single key on a large object (500+ keys) requires a full spread:

```ts
const settings = state('settings', { default: largeObj })

// Every update copies all 500 keys — 1.7M ops/s
settings.set(prev => ({ ...prev, theme: 'dark' }))

// patch() has the same cost internally (it spreads under the hood)
settings.patch({ theme: 'dark' })
```

The spread is pure JavaScript overhead (V8 object allocation), not library cost. The library's `set()` itself is ~14M ops/s regardless of object size — it just stores a reference. But for hot-path code touching large objects, the spread dominates.

### Proposed API

```ts
settings.mutate(draft => {
  draft.theme = 'dark'
})
```

**Semantics:**
- Receives the current value by reference
- User mutates it in place
- Library calls `set()` with the same reference after the callback returns
- Subscribers fire as normal

**Estimated performance:** ~14M ops/s (same as raw `set()`, no copy involved).

### Implementation sketch

```ts
// In MemoryStateImpl and StateImpl:
mutate(fn: (draft: T) => void): void {
  const current = this.get()
  fn(current)
  this.set(current)
}
```

### Trade-offs

| Pro | Con |
|-----|-----|
| Zero-copy — no spread, no allocation | Breaks immutability assumption |
| 8x faster than `patch()` for 500-key objects | `prev` value in subscribers/onChange is the same reference as `next` |
| Simple implementation (~5 lines) | `isEqual` will see the same reference and always bail — need to bypass it |
| Explicit opt-in (users choose when they need it) | `withHistory` captures the same reference — undo/redo would break |

### Open questions

1. **Should `mutate()` bypass `isEqual`?** It must, since the reference is the same. This means it always notifies, which is the correct intent — the user called `mutate()` because they changed something.
2. **Should `mutate()` bypass interceptors?** Probably not — interceptors may do logging or validation.
3. **How does this interact with `withHistory`?** History stores references. If the user mutates in place, the history stack becomes corrupted (all entries point to the same object). Options:
   - Document that `mutate()` is incompatible with `withHistory`
   - Have `mutate()` auto-snapshot (clone) before mutating when history is detected — but this reintroduces the copy cost
   - Throw if called on a history-enhanced instance
4. **Should it return the instance for chaining?** e.g. `settings.mutate(d => { d.a = 1 }).mutate(d => { d.b = 2 })`
5. **Alternative name?** `update()` (conflicts with collection), `modify()`, `tap()`

### Benchmark reference

From `benchmarks/internal/state-write.bench.ts` (500-key objects):

| Method | Throughput | Notes |
|--------|-----------|-------|
| `set(prebuilt)` (no spread) | ~14M ops/s | Library set() cost only |
| `set(prev => spread)` | ~1.7M ops/s | Realistic user pattern |
| `set({ ...constant })` | ~5K ops/s | V8 deopt, unrealistic |
| `mutate()` (proposed) | ~14M ops/s | Same as raw set() |

---

## Cross-tab sync double-notification

### Problem

When `sync: true` is enabled on a `local` or `bucket` scope, the receiving tab can be notified twice for a single change. Tab A's `set()` both writes to `localStorage` and broadcasts via `BroadcastChannel`. Tab B receives:

1. **BroadcastChannel message** → `adapter.set(value)` → writes to localStorage → cache populated → subscribers notified
2. **`storage` event** (from Tab A's original write) → cache invalidated → re-reads and re-parses JSON → subscribers notified again

Both events arrive in separate event loop turns, so the batch deduplication in `notify()` doesn't help. The storage adapter re-parses JSON on the second notification, producing a **new object reference** even though the value is functionally identical. Downstream consumers like React's `useSyncExternalStore` compare with `Object.is`, so the new reference triggers a spurious re-render.

### Impact

- Subscribers fire twice per cross-tab write (once from BroadcastChannel, once from the storage event)
- Object-valued state causes spurious re-renders in React due to new reference from re-parse

### Possible approaches

1. **Suppress storage events for synced keys** — Have the sync adapter mark keys it manages and skip `onStorageEvent` for those keys. Fragile if the storage adapter is shared.
2. **Debounce in the sync adapter** — After a BroadcastChannel write, ignore the next storage event for the same key within a short window.
3. **Value comparison before notifying** — Have the storage adapter's `onStorageEvent` compare the new raw string with the cached raw before notifying. If the raw string matches the cache (populated by the BroadcastChannel write), skip the notification.
4. **Let BroadcastChannel be the sole cross-tab channel** — Remove the `storage` event listener when sync is active, relying exclusively on BroadcastChannel for cross-tab updates. Fall back to storage events only when BroadcastChannel is unavailable.

### Files

- `src/adapters/sync.ts` — BroadcastChannel wrapper
- `src/adapters/storage.ts` — `onStorageEvent` handler, read cache

---

## DevTools callback loss when `configure()` is called after `enableDevTools()`

### Problem

`enableDevTools()` hooks into global config by saving the current `onChange`/`onReset`/`onRegister`/`onDestroy` callbacks and replacing them with devtools wrappers that chain to the originals. If the user later calls `configure({ onChange: newHandler })`, the devtools wrapper is silently overwritten — devtools stops dispatching to Redux DevTools and the logger.

When `disableDevTools()` runs, it restores the **pre-devtools** callbacks (saved at enable time), permanently losing the user's `newHandler`.

### Impact

- DevTools silently stops working after any `configure()` call that sets a callback devtools hooks into
- `disableDevTools()` restores stale callbacks, losing user handlers set after `enableDevTools()`

### Possible approaches

1. **Event emitter pattern** — Replace single-callback config properties (`onChange`, `onReset`, etc.) with an internal event emitter that supports multiple listeners. `configure()` adds/removes user listeners, and `enableDevTools()` adds its own without conflicting.
2. **Proxy / intercept pattern** — Have `enableDevTools()` install a Proxy or wrapper on the config object that intercepts callback mutations and re-chains automatically.
3. **Snapshot + merge on disable** — When `disableDevTools()` runs, compare the current callbacks with the devtools handlers. If they differ (user overwrote them), preserve the user's version instead of restoring the stale original.

### Files

- `src/devtools/index.ts` — `enableDevTools()`, `disableDevTools()`, callback wrappers
- `src/config.ts` — `configure()`, `globalConfig`
