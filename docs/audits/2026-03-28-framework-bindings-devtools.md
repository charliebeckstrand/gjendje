# Audit: Framework Bindings & DevTools — 2026-03-28

**Library version:** 1.3.4
**Scope:** React hook, Vue composable, DevTools integration, readonly wrapper, SSR,
utility functions, type safety.

**Prior audits reviewed:** All files in `docs/audits/`. Areas covered: data integrity,
error handling, resource lifecycle, API design, edge cases & correctness.

---

## Findings

### High

#### 1. `readonly()` does not shadow `patch()` — write access leaks through prototype

**File:** `src/readonly.ts:28–31`

The `readonly()` wrapper shadows `set`, `reset`, and `intercept` with `undefined`, but
`patch()` is also a write method on `BaseInstance` and is NOT shadowed. In untyped JS,
a consumer can call `.patch()` on a "readonly" instance and mutate state:

```typescript
return Object.create(instance, {
    set: { value: undefined },
    reset: { value: undefined },
    intercept: { value: undefined },
    // patch is missing — accessible via prototype
}) as ReadonlyInstance<T>
```

TypeScript prevents this at the type level (ReadonlyInstance doesn't expose patch), but
the purpose of the prototype shadowing is specifically to protect untyped JS callers.

**Impact:** Untyped JavaScript code can bypass the readonly contract via `instance.patch()`.

- [ ] Shadow `patch` in `readonly()` wrapper

---

#### 2. DevTools time-travel `set()` not wrapped in try/catch

**File:** `src/devtools/redux-devtools.ts:92–99`

When handling JUMP_TO_STATE / JUMP_TO_ACTION, each instance's `set()` is called without
error handling. If any set throws (interceptor rejection, validation error, write error),
the loop short-circuits and remaining instances are not updated:

```typescript
for (const instance of registry.values()) {
    if (instance.isDestroyed) continue
    const key = instance.key
    if (key in parsed) {
        instance.set(parsed[key])  // ← No try/catch — throws abort the loop
    }
}
```

**Impact:** Partial state restoration during time-travel debugging. Some instances update,
others don't, leaving DevTools and application state diverged.

- [ ] Wrap `instance.set()` in try/catch in `handleDevToolsMessage`

---

### Medium

#### 3. React hook: `selector` in `useMemo` deps causes unnecessary re-computation

**File:** `src/react/index.ts:55–59`

The `selector` parameter is included in the `useMemo` dependency array. When users pass
inline selectors (the common pattern: `useGjendje(state, v => v.name)`), `selector` is
a new function reference every render, causing `useMemo` to re-execute:

```typescript
return useMemo(() => {
    if (selector) return value
    if (writable) return [value, set, reset] as const
    return value
}, [selector, writable, value, set, reset])
//   ^^^^^^^^ new reference every render with inline arrow
```

The `selectorRef` pattern (line 31–32) already stabilizes the `getSnapshot` callback for
`useSyncExternalStore`. The `useMemo` here only decides the return shape (value vs tuple),
which depends on the *truthiness* of `selector`, not its identity.

**Impact:** Unnecessary `useMemo` re-computation on every render when using inline selectors.
No correctness issue — the returned value is identical — but wastes CPU cycles.

- [ ] Use `!!selector` in deps instead of `selector` identity, or remove from deps

---

#### 4. `readonly()` does not shadow `onChange` or `watch` (design note)

**File:** `src/readonly.ts:28–31`

`onChange` and `watch` are observation methods (they don't mutate state), so they're arguably
fine to leave accessible on a readonly wrapper. However, the ReadonlyInstance type doesn't
include them, so TypeScript prevents calling them. Untyped JS callers CAN call them — but
since they're read-only operations, this is harmless.

**No action required** — documenting for completeness. Only `patch` (finding #1) is a
real write leak.

---

### Low

#### 5. DevTools: `enableDevTools()` double-call doesn't refresh options

**File:** `src/devtools/index.ts:169–172`

If `enableDevTools()` is called twice with different options (e.g., first with logger enabled,
then with logger disabled), the second call returns early and the options are not updated:

```typescript
if (devToolsEnabled) {
    return disableDevTools  // ← Ignores new options
}
```

**Impact:** Users must call `disableDevTools()` then `enableDevTools(newOptions)` to change
options. This is the expected pattern, but could be documented more clearly.

- [ ] Add JSDoc note that options are only applied on first enable

---

## Areas Verified Clean

| Area | Notes |
|------|-------|
| **React `useSyncExternalStore`** | `subscribe` and `getSnapshot` correctly stabilized with `useCallback`; `selectorRef` prevents unnecessary resubscriptions |
| **Vue `customRef`** | Correctly uses `onScopeDispose` for cleanup; `Object.is` comparison prevents unnecessary triggers |
| **SSR `afterHydration`** | Microtask + rAF pattern correctly defers past React hydration; server no-op returns RESOLVED |
| **`isServer()` detection** | Checks both `window` and `document` — covers Node.js, Deno, and edge runtimes |
| **`createLazyDestroyed`** | Correctly handles resolve-before-access: else branch sets `_promise = Promise.resolve()`, getter returns it |
| **`shallowEqual`** | Handles Date, RegExp, Set, Map, arrays, and plain objects. `Object.keys()` not including Symbols is standard behavior (matches React, Redux) |
| **`isRecord` type guard** | Correctly narrows `unknown` to `Record<PropertyKey, unknown>` |
| **Error class hierarchy** | All error classes extend `GjendjeError`, include cause, and are exported |
| **DevTools `safeSend`** | Wraps `devTools.send()` in try/catch — errors in extension don't crash the app |
| **DevTools callback chaining** | `callOriginal` wraps user callbacks in try/catch — error in original doesn't break DevTools |
| **Redux DevTools disconnect** | Properly cleans up subscription and nulls references |

---

## Test Coverage Gaps

| Gap | Priority | Related Finding |
|------|----------|----------------|
| `readonly()` instance calling `.patch()` in untyped JS | High | Finding #1 |
| DevTools time-travel when `set()` throws (interceptor/validation) | High | Finding #2 |
| React hook with inline selector — verify no unnecessary re-renders | Medium | Finding #3 |
| `previous()` when source is destroyed externally | Low | — |
| `destroyAll()` during active batch/notification | Low | — |

---

## Summary

The framework bindings and DevTools are in **good condition**. The React hook correctly
uses `useSyncExternalStore` with stabilized callbacks, and the Vue composable properly
integrates with Vue's reactivity system and cleanup lifecycle.

The two actionable findings are:
1. **`readonly()` missing `patch` shadow** — real write access leak in untyped JS
2. **DevTools time-travel missing error handling** — partial state restoration on error

Both are straightforward fixes.
