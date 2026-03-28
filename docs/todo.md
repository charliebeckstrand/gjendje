# Engineering TODO

Near-term engineering tasks and API proposals. For longer-term product and community goals, see [roadmap.md](roadmap.md).

---

## `render` scope — add runtime deprecation warning

The `'render'` scope is silently normalized to `'memory'` (deprecated in 1.0.0, see [deprecations.md](deprecations.md)). Currently there is no runtime feedback — users won't know they're using a deprecated alias. Add a `console.warn` on first use so they can migrate before removal in the next major version.

---

## `mutate()` — zero-copy update for large objects

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
