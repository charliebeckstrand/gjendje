# Audit: Bucket Adapter — 2026-03-28

**Library version:** 1.3.4
**Scope:** Bucket adapter delegate lifecycle, cross-tab event forwarding, interceptor
system, effect system, computed chains, batch interactions, URL/sync adapters, SSR.

**Prior audits reviewed:** All files in `docs/audits/`. Areas covered: data integrity,
error handling, edge cases & correctness, framework bindings & DevTools, persistence,
collection & lifecycle.

---

## Findings

### High

#### 1. Bucket adapter fallback delegate doesn't forward cross-tab storage events

**File:** `src/adapters/bucket.ts:124–248`

When the Storage Buckets API is not available (most browsers), the bucket adapter falls
back to a `localStorage`/`sessionStorage` delegate. However, the subscription that forwards
delegate storage events to the bucket's own listeners was only set up at the end of the
async initialization block (line 234). When `isBucketSupported()` returns `false`, the
async block returns early at line 131, and `delegateUnsub` remains `undefined`.

```typescript
const ready = (async (): Promise<void> => {
    if (!isBucketSupported()) return  // ← Exits early

    // ... bucket initialization ...

    // Forward future storage events from the delegate to our listeners
    delegateUnsub = delegate.subscribe(...)  // ← Never reached on fallback path
})()
```

Users subscribe to the bucket's own `listeners` (line 256), but the fallback delegate's
storage events are never forwarded to those listeners.

**Impact:** Cross-tab reactivity is completely broken for bucket-scoped state on browsers
without Storage Buckets API support. `localStorage` changes from other tabs are silently
ignored — subscribers never fire.

- [x] Subscribe to delegate events immediately in the synchronous path, re-subscribe after swap

---

## Areas Verified Clean

| Area | Notes |
|------|-------|
| **Interceptor system** (`core.ts`) | Interceptors correctly chain via `runInterceptors`, async interceptors properly awaited, errors propagated |
| **Effect cleanup timing** (`effect.ts`) | Cleanup runs before re-run and on stop; `isStopped` guard prevents double cleanup |
| **Computed diamond dependencies** (`computed.ts`) | `useSyncExternalStore` pattern in React and batch deduplication prevent glitches |
| **Batch + computed interaction** (`batch.ts`) | Generation counter prevents double notification; computed recomputes on next `get()` |
| **URL adapter encoding** (`url.ts`) | Uses `URLSearchParams` for encoding/decoding — handles special characters correctly |
| **Sync adapter error handling** (`sync.ts`) | `isDestroyed` guard prevents processing after close; BroadcastChannel errors caught |
| **SSR detection** (`ssr.ts`) | Checks both `window` and `document` — covers all server environments |
| **Bucket delegate swap** (`bucket.ts`) | Post-swap destroy check, value migration, expiry detection all correct |
| **Select/computed chains** | Subscription cleanup correct; destroyed state returns NOOP |

---

## Summary

One high-severity finding: the bucket adapter's fallback delegate did not forward cross-tab
storage events to subscribers. Fixed by subscribing to delegate events immediately in the
synchronous initialization path and re-subscribing after delegate swap.

This was the only new finding across a comprehensive review of the interceptor system, effect
system, computed chains, batch interactions, URL/sync adapters, and SSR utilities.
