---
"gjendje": patch
---

Performance and correctness audit — error isolation, allocation reduction, and pattern cleanup.

**Correctness:**
- Error-isolate batch flush loop so one throwing listener can't silence remaining notifications
- Error-isolate change handler loops via `safeCallChange()` helper across StateImpl and MemoryStateImpl (extracted to separate function to avoid V8 deoptimization of hot `set()` method)
- Error-isolate effect callbacks with try/catch to prevent crashing the notification chain
- Add `safeCall` to collection watcher notification loops for error isolation consistency
- Guard `computed`/`select` `subscribe()` against destroyed state to prevent listener leaks
- Fix `withHistory` `navigate()` to defer stack pop/push until after successful `set()`, preventing history corruption when set throws
- Fix `withWatch` re-entrancy guard to prevent double subscription when subscribe fires synchronously
- Clear refs in `withWatch` `destroy()` to aid garbage collection

**Performance:**
- Remove redundant `_hasIsEqual` boolean field from MemoryStateImpl — simplify to optional chaining only (isEqual writes +14%, middleware +8–13%)
- Clear `notifyFn` on MemoryStateImpl destroy to prevent stale batch notifications
- Replace `new Set(Object.keys(...))` with `Object.hasOwn` in strict `patch()`
- Lazy-allocate `changedKeys` Set in collection watcher diffing (skip allocation when nothing changed)
- Defer collection watchers Map and base subscription to first `watch()` call
- Hoist `previous()` notification closure out of subscribe callback (enables batch deduplication)
- Consolidate computed async dep promise construction into single loop with pre-allocated arrays
- Use `createLazyDestroyed` utility in computed/select instead of inlining the pattern
