/**
 * Computed dependency tracking — alternative approach benchmarks.
 *
 * Tests the current subscription+dirty-flag approach against:
 *   A. Version counting (pull-based) — each dep has a monotonic counter;
 *      computed compares stored versions on get(), no subscription needed.
 *   B. Lazy subscription — only subscribes when the computed itself has
 *      subscribers; pure pull for unobserved computeds.
 *   C. Early bailout on same-value dep — if a dep fires but its value
 *      is identity-equal to what computed saw last time, skip recompute.
 *   D. Version counting + lazy subscription combined.
 *
 * Scenarios benchmarked:
 *   1. Pull-only read — repeated get() on a computed with no subscribers.
 *   2. Push path — dep changes, computed has a subscriber, measures
 *      end-to-end propagation.
 *   3. Diamond dependency — A → [B, C] → D, ensures dedup still works.
 *   4. Wide fan-in — 8 deps, read repeatedly (depValues loop cost).
 *   5. Chain — A → B → C → D → E (5-deep), measures propagation depth.
 *   6. Same-value dep fire — dep fires but value unchanged; measures
 *      how much work each strategy wastes.
 *   7. Creation cost — how expensive is it to set up a computed().
 *
 * Run with: npx tsx benchmarks/computed-experiment.bench.ts
 */

import { Bench } from 'tinybench'
import { printResults } from './helpers.js'

// ---------------------------------------------------------------------------
// Minimal state primitive — shared across all strategies
// ---------------------------------------------------------------------------

// A simple versioned memory state that exposes a version counter directly.
// This lets the version-counting strategies compare without subscriptions.

interface VersionedState<T> {
	get(): T
	peek(): T
	set(v: T): void
	subscribe(fn: (v: T) => void): () => void
	/** Monotonically increasing; bumped on every set() that changes value. */
	version: number
}

function makeState<T>(initial: T): VersionedState<T> {
	let value = initial
	let ver = 0
	const listeners = new Set<(v: T) => void>()

	return {
		get version() {
			return ver
		},
		get() {
			return value
		},
		peek() {
			return value
		},
		set(v: T) {
			if (v === value) return
			value = v
			ver++
			for (const fn of listeners) fn(v)
		},
		subscribe(fn: (v: T) => void) {
			listeners.add(fn)
			return () => {
				listeners.delete(fn)
			}
		},
	}
}

// ---------------------------------------------------------------------------
// CURRENT implementation — subscribe eagerly, dirty flag
// ---------------------------------------------------------------------------

interface ComputedCurrent<T> {
	get(): T
	subscribe(fn: (v: T) => void): () => void
	destroy(): void
}

function makeComputedCurrent<T>(
	deps: VersionedState<unknown>[],
	fn: (vals: unknown[]) => T,
): ComputedCurrent<T> {
	const depLen = deps.length
	const depValues = new Array(depLen)
	let cached: T
	let isDirty = true
	const listeners = new Set<(v: T) => void>()

	function recompute(): T {
		if (!isDirty) return cached
		for (let i = 0; i < depLen; i++) {
			depValues[i] = deps[i]!.get()
		}
		cached = fn(depValues)
		isDirty = false
		return cached
	}

	const markDirty = () => {
		isDirty = true
		const prev = cached
		const next = recompute()
		if (next === prev) return
		for (const fn of listeners) fn(next)
	}

	const unsubs = deps.map((d) => d.subscribe(markDirty))

	// Compute initial value eagerly
	recompute()

	return {
		get() {
			return recompute()
		},
		subscribe(fn) {
			listeners.add(fn)
			return () => listeners.delete(fn)
		},
		destroy() {
			for (const u of unsubs) u()
			listeners.clear()
		},
	}
}

// ---------------------------------------------------------------------------
// STRATEGY A — Version counting (pull-based, no subscription)
//
// Each dep exposes a monotonic `version` counter. The computed stores the
// version it last saw for each dep. On get(), compare stored vs current
// versions. If any differ, recompute. No subscription, no dirty flag.
//
// Trade-off: get() is O(deps) even when nothing changed, but avoids any
// subscription wiring. Ideal for computed values that are only read
// imperatively (no push observers).
// ---------------------------------------------------------------------------

interface ComputedVersionCount<T> {
	get(): T
	subscribe(fn: (v: T) => void): () => void
	destroy(): void
}

function makeComputedVersionCount<T>(
	deps: VersionedState<unknown>[],
	fn: (vals: unknown[]) => T,
): ComputedVersionCount<T> {
	const depLen = deps.length
	const depValues = new Array(depLen)
	const seenVersions = new Int32Array(depLen) // all 0, deps start at 0 too
	let cached: T
	let hasValue = false

	// For push semantics we still need subscriptions when we have observers,
	// but Strategy A is pure pull — no sub, no push. Observers not supported here.
	// This is the "pure pull" ceiling.

	function recompute(): T {
		let dirty = !hasValue
		if (!dirty) {
			for (let i = 0; i < depLen; i++) {
				if (seenVersions[i] !== deps[i]!.version) {
					dirty = true
					break
				}
			}
		}
		if (!dirty) return cached

		for (let i = 0; i < depLen; i++) {
			depValues[i] = deps[i]!.get()
			seenVersions[i] = deps[i]!.version
		}
		cached = fn(depValues)
		hasValue = true
		return cached
	}

	// Eager initial compute
	recompute()

	return {
		get() {
			return recompute()
		},
		subscribe(_fn: (v: T) => void) {
			// Pure pull — no push support. In a real implementation you'd fall back
			// to subscriptions when observers are added (see Strategy D).
			return () => {}
		},
		destroy() {},
	}
}

// ---------------------------------------------------------------------------
// STRATEGY B — Lazy subscription (subscribe only when computed has observers)
//
// While there are no downstream observers, acts as pure pull (dirty flag,
// no dep subscriptions active). On first subscribe(), activates dep subs
// and switches to push mode. On last unsubscribe(), tears down dep subs.
//
// Win: zero subscription cost for imperatively-read computeds.
// Cost: first subscribe() has to wire up subscriptions.
// ---------------------------------------------------------------------------

function makeComputedLazySub<T>(
	deps: VersionedState<unknown>[],
	fn: (vals: unknown[]) => T,
): ComputedCurrent<T> {
	const depLen = deps.length
	const depValues = new Array(depLen)
	let cached: T
	let isDirty = true
	const listeners = new Set<(v: T) => void>()
	let activeUnsubs: (() => void)[] | null = null

	function recompute(): T {
		if (!isDirty) return cached
		for (let i = 0; i < depLen; i++) {
			depValues[i] = deps[i]!.get()
		}
		cached = fn(depValues)
		isDirty = false
		return cached
	}

	const markDirty = () => {
		isDirty = true
		const prev = cached
		const next = recompute()
		if (next === prev) return
		for (const fn of listeners) fn(next)
	}

	function activateSubs() {
		if (activeUnsubs !== null) return
		// Mark dirty before re-subscribing — dep may have changed while we were asleep
		isDirty = true
		activeUnsubs = deps.map((d) => d.subscribe(markDirty))
	}

	function deactivateSubs() {
		if (activeUnsubs === null) return
		for (const u of activeUnsubs) u()
		activeUnsubs = null
		isDirty = true // will re-read on next get()
	}

	// No initial subscriptions — pure pull until someone subscribes
	recompute()

	return {
		get() {
			return recompute()
		},
		subscribe(fn) {
			listeners.add(fn)
			activateSubs()
			return () => {
				listeners.delete(fn)
				if (listeners.size === 0) deactivateSubs()
			}
		},
		destroy() {
			deactivateSubs()
			listeners.clear()
		},
	}
}

// ---------------------------------------------------------------------------
// STRATEGY C — Early bailout: skip recompute when dep value unchanged
//
// Current code marks dirty on any dep subscription fire. If the dep's
// value is identity-equal to what we stored, we don't need to recompute
// at all. Store dep values at last compute; on markDirty, check the firing
// dep's current value against stored. If same, skip.
//
// This requires knowing *which* dep fired — tracked via per-dep markDirty.
// ---------------------------------------------------------------------------

function makeComputedEarlyBailout<T>(
	deps: VersionedState<unknown>[],
	fn: (vals: unknown[]) => T,
): ComputedCurrent<T> {
	const depLen = deps.length
	const depValues = new Array(depLen)
	const storedDepValues = new Array(depLen)
	let cached: T
	let isDirty = true
	const listeners = new Set<(v: T) => void>()

	function recompute(): T {
		if (!isDirty) return cached
		for (let i = 0; i < depLen; i++) {
			depValues[i] = deps[i]!.get()
			storedDepValues[i] = depValues[i]
		}
		cached = fn(depValues)
		isDirty = false
		return cached
	}

	// Per-dep markDirty so we know which dep fired
	const perDepMarkDirty = deps.map((dep, idx) => () => {
		// If this dep's current value is the same as what we computed with, skip
		const current = dep.get()
		if (!isDirty && current === storedDepValues[idx]) return

		isDirty = true
		storedDepValues[idx] = current

		const prev = cached
		const next = recompute()
		if (next === prev) return
		for (const fn of listeners) fn(next)
	})

	const unsubs = deps.map((d, i) => d.subscribe(perDepMarkDirty[i]!))

	recompute()

	return {
		get() {
			return recompute()
		},
		subscribe(fn) {
			listeners.add(fn)
			return () => listeners.delete(fn)
		},
		destroy() {
			for (const u of unsubs) u()
			listeners.clear()
		},
	}
}

// ---------------------------------------------------------------------------
// STRATEGY D — Version counting + lazy subscription (combined)
//
// Pull: uses version counters to check staleness on get(), zero overhead
//       when nothing changed.
// Push: when observers attach, subscribes to deps and notifies on change.
//       Uses version counters to deduplicate in diamond graphs.
// ---------------------------------------------------------------------------

function makeComputedVersionLazy<T>(
	deps: VersionedState<unknown>[],
	fn: (vals: unknown[]) => T,
): ComputedCurrent<T> {
	const depLen = deps.length
	const depValues = new Array(depLen)
	const seenVersions = new Int32Array(depLen)
	let cached: T
	let hasValue = false
	const listeners = new Set<(v: T) => void>()
	let activeUnsubs: (() => void)[] | null = null

	function recompute(): T {
		let dirty = !hasValue
		if (!dirty) {
			for (let i = 0; i < depLen; i++) {
				if (seenVersions[i] !== deps[i]!.version) {
					dirty = true
					break
				}
			}
		}
		if (!dirty) return cached

		for (let i = 0; i < depLen; i++) {
			depValues[i] = deps[i]!.get()
			seenVersions[i] = deps[i]!.version
		}
		cached = fn(depValues)
		hasValue = true
		return cached
	}

	const onDepChange = () => {
		// Re-check versions to deduplicate diamond notifications:
		// if all dep versions match what we saw, nothing actually changed.
		let dirty = false
		for (let i = 0; i < depLen; i++) {
			if (seenVersions[i] !== deps[i]!.version) {
				dirty = true
				break
			}
		}
		if (!dirty) return

		const prev = cached
		const next = recompute()
		if (next === prev) return
		for (const fn of listeners) fn(next)
	}

	function activateSubs() {
		if (activeUnsubs !== null) return
		hasValue = false // force version re-check on next get()
		activeUnsubs = deps.map((d) => d.subscribe(onDepChange))
	}

	function deactivateSubs() {
		if (activeUnsubs === null) return
		for (const u of activeUnsubs) u()
		activeUnsubs = null
		hasValue = false
	}

	recompute()

	return {
		get() {
			return recompute()
		},
		subscribe(fn) {
			listeners.add(fn)
			activateSubs()
			return () => {
				listeners.delete(fn)
				if (listeners.size === 0) deactivateSubs()
			}
		},
		destroy() {
			deactivateSubs()
			listeners.clear()
		},
	}
}

// ---------------------------------------------------------------------------
// Scenario 1 — Pull-only: repeated get() with no subscribers
//
// Most common in server-side / non-reactive code paths. Measures the cost
// of calling .get() when the dep is clean (no changes since last compute).
// ---------------------------------------------------------------------------

async function benchPullOnlyClean() {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	const a = makeState(1)
	const b = makeState(2)

	const curr = makeComputedCurrent([a, b], ([x, y]) => (x as number) + (y as number))
	const verCount = makeComputedVersionCount([a, b], ([x, y]) => (x as number) + (y as number))
	const lazySub = makeComputedLazySub([a, b], ([x, y]) => (x as number) + (y as number))
	const earlyOut = makeComputedEarlyBailout([a, b], ([x, y]) => (x as number) + (y as number))
	const verLazy = makeComputedVersionLazy([a, b], ([x, y]) => (x as number) + (y as number))

	let sink = 0

	bench.add('pull clean — current (dirty flag + eager sub)', () => {
		sink += curr.get()
	})

	bench.add('pull clean — version counting (no sub)', () => {
		sink += verCount.get()
	})

	bench.add('pull clean — lazy subscription', () => {
		sink += lazySub.get()
	})

	bench.add('pull clean — early bailout', () => {
		sink += earlyOut.get()
	})

	bench.add('pull clean — version + lazy sub', () => {
		sink += verLazy.get()
	})

	await bench.run()

	console.log('\n── Scenario 1: Pull-only get() — dep unchanged (clean cache) ──')
	printResults(bench)

	void sink
}

// ---------------------------------------------------------------------------
// Scenario 2 — Pull-only: get() after dep changed (must recompute)
// ---------------------------------------------------------------------------

async function benchPullDirty() {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	const a = makeState(1)
	const b = makeState(2)

	const curr = makeComputedCurrent([a, b], ([x, y]) => (x as number) + (y as number))
	const verCount = makeComputedVersionCount([a, b], ([x, y]) => (x as number) + (y as number))
	const lazySub = makeComputedLazySub([a, b], ([x, y]) => (x as number) + (y as number))
	const earlyOut = makeComputedEarlyBailout([a, b], ([x, y]) => (x as number) + (y as number))
	const verLazy = makeComputedVersionLazy([a, b], ([x, y]) => (x as number) + (y as number))

	let sink = 0
	let counter = 0

	bench.add('pull dirty — current (dirty flag + eager sub)', () => {
		a.set(++counter)
		sink += curr.get()
	})

	bench.add('pull dirty — version counting (no sub)', () => {
		a.set(++counter)
		sink += verCount.get()
	})

	bench.add('pull dirty — lazy subscription', () => {
		a.set(++counter)
		sink += lazySub.get()
	})

	bench.add('pull dirty — early bailout', () => {
		a.set(++counter)
		sink += earlyOut.get()
	})

	bench.add('pull dirty — version + lazy sub', () => {
		a.set(++counter)
		sink += verLazy.get()
	})

	await bench.run()

	console.log('\n── Scenario 2: Pull-only get() — dep changed (must recompute) ──')
	printResults(bench)

	void sink
}

// ---------------------------------------------------------------------------
// Scenario 3 — Push path: dep changes, computed has 1 subscriber
//
// Measures end-to-end push propagation: set() → subscriber fires.
// ---------------------------------------------------------------------------

async function benchPushOneSub() {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	const a = makeState(1)
	const b = makeState(2)

	const curr = makeComputedCurrent([a, b], ([x, y]) => (x as number) + (y as number))
	const lazySub = makeComputedLazySub([a, b], ([x, y]) => (x as number) + (y as number))
	const earlyOut = makeComputedEarlyBailout([a, b], ([x, y]) => (x as number) + (y as number))
	const verLazy = makeComputedVersionLazy([a, b], ([x, y]) => (x as number) + (y as number))

	// Version-count pure pull doesn't support push — excluded from this bench

	let sink = 0
	const aCurr = makeState(1)
	const aLazy = makeState(1)
	const aEarly = makeState(1)
	const aVerL = makeState(1)

	const cCurr = makeComputedCurrent([aCurr, b], ([x, y]) => (x as number) + (y as number))
	const cLazy = makeComputedLazySub([aLazy, b], ([x, y]) => (x as number) + (y as number))
	const cEarly = makeComputedEarlyBailout([aEarly, b], ([x, y]) => (x as number) + (y as number))
	const cVerL = makeComputedVersionLazy([aVerL, b], ([x, y]) => (x as number) + (y as number))

	cCurr.subscribe((v) => { sink += v })
	cLazy.subscribe((v) => { sink += v })
	cEarly.subscribe((v) => { sink += v })
	cVerL.subscribe((v) => { sink += v })

	let counter = 10

	bench.add('push 1-sub — current (eager sub + dirty flag)', () => {
		aCurr.set(++counter)
	})

	bench.add('push 1-sub — lazy subscription', () => {
		aLazy.set(++counter)
	})

	bench.add('push 1-sub — early bailout', () => {
		aEarly.set(++counter)
	})

	bench.add('push 1-sub — version + lazy sub', () => {
		aVerL.set(++counter)
	})

	await bench.run()

	console.log('\n── Scenario 3: Push propagation — dep changes, 1 subscriber on computed ──')
	printResults(bench)

	void sink
	void curr
	void lazySub
	void earlyOut
	void verLazy
}

// ---------------------------------------------------------------------------
// Scenario 4 — Diamond dependency graph: A → [B, C] → D
//
// D has two deps (B and C) that both depend on A.
// When A changes, both B and C fire, causing D to be notified twice.
// Tests dedup / wasted-recompute behavior.
// ---------------------------------------------------------------------------

async function benchDiamond() {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	let sink = 0
	let counter = 0

	// Current: A → [B, C] → D
	{
		const a = makeState(0)
		const b = makeComputedCurrent([a], ([x]) => (x as number) * 2)
		const c = makeComputedCurrent([a], ([x]) => (x as number) + 10)

		// D subscribes to both B and C
		const d = makeComputedCurrent(
			[b as unknown as VersionedState<unknown>, c as unknown as VersionedState<unknown>],
			([bv, cv]) => (bv as number) + (cv as number),
		)
		d.subscribe((v) => { sink += v })

		bench.add('diamond — current (eager sub)', () => {
			a.set(++counter)
		})
	}

	// Early bailout: A → [B, C] → D
	{
		const a = makeState(0)
		const b = makeComputedEarlyBailout([a], ([x]) => (x as number) * 2)
		const c = makeComputedEarlyBailout([a], ([x]) => (x as number) + 10)
		const d = makeComputedEarlyBailout(
			[b as unknown as VersionedState<unknown>, c as unknown as VersionedState<unknown>],
			([bv, cv]) => (bv as number) + (cv as number),
		)
		d.subscribe((v) => { sink += v })

		bench.add('diamond — early bailout', () => {
			a.set(++counter)
		})
	}

	// Version + lazy sub: A → [B, C] → D
	{
		const a = makeState(0)
		const b = makeComputedVersionLazy([a], ([x]) => (x as number) * 2)
		const c = makeComputedVersionLazy([a], ([x]) => (x as number) + 10)
		const d = makeComputedVersionLazy(
			[b as unknown as VersionedState<unknown>, c as unknown as VersionedState<unknown>],
			([bv, cv]) => (bv as number) + (cv as number),
		)
		d.subscribe((v) => { sink += v })

		bench.add('diamond — version + lazy sub', () => {
			a.set(++counter)
		})
	}

	// Lazy sub: A → [B, C] → D
	{
		const a = makeState(0)
		const b = makeComputedLazySub([a], ([x]) => (x as number) * 2)
		const c = makeComputedLazySub([a], ([x]) => (x as number) + 10)
		const d = makeComputedLazySub(
			[b as unknown as VersionedState<unknown>, c as unknown as VersionedState<unknown>],
			([bv, cv]) => (bv as number) + (cv as number),
		)
		d.subscribe((v) => { sink += v })

		bench.add('diamond — lazy subscription', () => {
			a.set(++counter)
		})
	}

	await bench.run()

	console.log('\n── Scenario 4: Diamond A → [B, C] → D — push with duplicate notifications ──')
	printResults(bench)

	void sink
}

// ---------------------------------------------------------------------------
// Scenario 5 — Wide fan-in: 8 deps
//
// Measures cost of the depValues loop with N=8.
// Pull (clean): are version comparisons cheaper than the dirty flag?
// ---------------------------------------------------------------------------

async function benchWideFanIn() {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	const N = 8
	const deps = Array.from({ length: N }, (_, i) => makeState(i))

	const curr = makeComputedCurrent(deps, (vals) => (vals as number[]).reduce((a, b) => a + b, 0))
	const verCount = makeComputedVersionCount(
		deps,
		(vals) => (vals as number[]).reduce((a, b) => a + b, 0),
	)
	const lazySub = makeComputedLazySub(
		deps,
		(vals) => (vals as number[]).reduce((a, b) => a + b, 0),
	)
	const verLazy = makeComputedVersionLazy(
		deps,
		(vals) => (vals as number[]).reduce((a, b) => a + b, 0),
	)

	let sink = 0

	bench.add('wide fan-in (8 deps) clean get — current', () => {
		sink += curr.get()
	})

	bench.add('wide fan-in (8 deps) clean get — version counting', () => {
		sink += verCount.get()
	})

	bench.add('wide fan-in (8 deps) clean get — lazy sub', () => {
		sink += lazySub.get()
	})

	bench.add('wide fan-in (8 deps) clean get — version + lazy', () => {
		sink += verLazy.get()
	})

	await bench.run()

	console.log('\n── Scenario 5: Wide fan-in (8 deps) — clean get() ──')
	printResults(bench)

	void sink
}

// ---------------------------------------------------------------------------
// Scenario 6 — Chain propagation: A → B → C → D → E (5-deep)
//
// Tests how well each strategy propagates through a chain.
// Push: A changes, E's subscriber fires.
// ---------------------------------------------------------------------------

async function benchChain() {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	let sink = 0
	let counter = 0

	// Current
	{
		const a = makeState(0)
		const b = makeComputedCurrent([a], ([x]) => (x as number) + 1)
		const c = makeComputedCurrent(
			[b as unknown as VersionedState<unknown>],
			([x]) => (x as number) + 1,
		)
		const d = makeComputedCurrent(
			[c as unknown as VersionedState<unknown>],
			([x]) => (x as number) + 1,
		)
		const e = makeComputedCurrent(
			[d as unknown as VersionedState<unknown>],
			([x]) => (x as number) + 1,
		)
		e.subscribe((v) => { sink += v })

		bench.add('chain 5-deep push — current', () => {
			a.set(++counter)
		})
	}

	// Lazy sub
	{
		const a = makeState(0)
		const b = makeComputedLazySub([a], ([x]) => (x as number) + 1)
		const c = makeComputedLazySub(
			[b as unknown as VersionedState<unknown>],
			([x]) => (x as number) + 1,
		)
		const d = makeComputedLazySub(
			[c as unknown as VersionedState<unknown>],
			([x]) => (x as number) + 1,
		)
		const e = makeComputedLazySub(
			[d as unknown as VersionedState<unknown>],
			([x]) => (x as number) + 1,
		)
		e.subscribe((v) => { sink += v })

		bench.add('chain 5-deep push — lazy sub', () => {
			a.set(++counter)
		})
	}

	// Version + lazy sub
	{
		const a = makeState(0)
		const b = makeComputedVersionLazy([a], ([x]) => (x as number) + 1)
		const c = makeComputedVersionLazy(
			[b as unknown as VersionedState<unknown>],
			([x]) => (x as number) + 1,
		)
		const d = makeComputedVersionLazy(
			[c as unknown as VersionedState<unknown>],
			([x]) => (x as number) + 1,
		)
		const e = makeComputedVersionLazy(
			[d as unknown as VersionedState<unknown>],
			([x]) => (x as number) + 1,
		)
		e.subscribe((v) => { sink += v })

		bench.add('chain 5-deep push — version + lazy sub', () => {
			a.set(++counter)
		})
	}

	// Early bailout
	{
		const a = makeState(0)
		const b = makeComputedEarlyBailout([a], ([x]) => (x as number) + 1)
		const c = makeComputedEarlyBailout(
			[b as unknown as VersionedState<unknown>],
			([x]) => (x as number) + 1,
		)
		const d = makeComputedEarlyBailout(
			[c as unknown as VersionedState<unknown>],
			([x]) => (x as number) + 1,
		)
		const e = makeComputedEarlyBailout(
			[d as unknown as VersionedState<unknown>],
			([x]) => (x as number) + 1,
		)
		e.subscribe((v) => { sink += v })

		bench.add('chain 5-deep push — early bailout', () => {
			a.set(++counter)
		})
	}

	await bench.run()

	console.log('\n── Scenario 6: Chain A→B→C→D→E push propagation ──')
	printResults(bench)

	void sink
}

// ---------------------------------------------------------------------------
// Scenario 7 — Same-value dep fire
//
// A dep fires (set() is called) but the value is identical. Measures how
// much wasted work each strategy does when the change is a no-op.
//
// NOTE: our makeState() already skips notification on same-value set(),
// so this scenario simulates a dep that changes and then changes back.
// We test by toggling between two values, so half the fires produce the
// same output (f(0+2)=f(2+0) — same sum, different order).
// ---------------------------------------------------------------------------

async function benchSameValueFire() {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	// Two deps that alternate, but their sum stays constant.
	// a=1,b=2  →  a=2,b=1  →  a=1,b=2  — sum always 3
	const toggle = (i: number) => (i % 2 === 0 ? [1, 2] : [2, 1])

	let sink = 0
	let iter = 0

	// Current — will recompute every time even though result is the same
	{
		const a = makeState(1)
		const b = makeState(2)
		const c = makeComputedCurrent([a, b], ([x, y]) => (x as number) + (y as number))
		c.subscribe((v) => { sink += v })

		bench.add('same-value fire — current (always recomputes)', () => {
			const [av, bv] = toggle(iter++)
			a.set(av!)
			b.set(bv!)
		})
	}

	// Early bailout — should detect that output is same and skip downstream
	{
		const a = makeState(1)
		const b = makeState(2)
		const c = makeComputedEarlyBailout([a, b], ([x, y]) => (x as number) + (y as number))
		c.subscribe((v) => { sink += v })

		bench.add('same-value fire — early bailout (skips if output same)', () => {
			const [av, bv] = toggle(iter++)
			a.set(av!)
			b.set(bv!)
		})
	}

	// Version + lazy sub
	{
		const a = makeState(1)
		const b = makeState(2)
		const c = makeComputedVersionLazy([a, b], ([x, y]) => (x as number) + (y as number))
		c.subscribe((v) => { sink += v })

		bench.add('same-value fire — version + lazy (skips if output same)', () => {
			const [av, bv] = toggle(iter++)
			a.set(av!)
			b.set(bv!)
		})
	}

	await bench.run()

	console.log('\n── Scenario 7: Same-output dep fire — wasted recompute cost ──')
	printResults(bench)

	void sink
}

// ---------------------------------------------------------------------------
// Scenario 8 — Creation cost
//
// How expensive is it to create a computed? Includes: closure allocation,
// dep subscriptions, initial recompute.
// ---------------------------------------------------------------------------

async function benchCreationCost() {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	const a = makeState(1)
	const b = makeState(2)

	bench.add('create — current (eager sub)', () => {
		const c = makeComputedCurrent([a, b], ([x, y]) => (x as number) + (y as number))
		c.destroy()
	})

	bench.add('create — version counting (no sub)', () => {
		const c = makeComputedVersionCount([a, b], ([x, y]) => (x as number) + (y as number))
		c.destroy()
	})

	bench.add('create — lazy subscription (no sub until observer)', () => {
		const c = makeComputedLazySub([a, b], ([x, y]) => (x as number) + (y as number))
		c.destroy()
	})

	bench.add('create — early bailout', () => {
		const c = makeComputedEarlyBailout([a, b], ([x, y]) => (x as number) + (y as number))
		c.destroy()
	})

	bench.add('create — version + lazy sub', () => {
		const c = makeComputedVersionLazy([a, b], ([x, y]) => (x as number) + (y as number))
		c.destroy()
	})

	await bench.run()

	console.log('\n── Scenario 8: Creation cost (create + destroy, no reads) ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Scenario 9 — Version counting: version loop vs dirty flag on clean get()
//
// Isolates just the "is cached?" check: Boolean flag test vs Int32Array loop.
// Measures the pure overhead on the hot no-change path.
// ---------------------------------------------------------------------------

async function benchVersionVsDirtyFlag() {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	const N_DEPS = [1, 2, 4, 8]

	for (const n of N_DEPS) {
		const deps = Array.from({ length: n }, (_, i) => makeState(i))

		// Dirty flag: O(1) check
		const cDirty = makeComputedCurrent(
			deps,
			(vals) => (vals as number[]).reduce((a, b) => a + b, 0),
		)

		// Version array: O(n) loop — but each iter is a simple integer compare
		const cVer = makeComputedVersionCount(
			deps,
			(vals) => (vals as number[]).reduce((a, b) => a + b, 0),
		)

		let sink = 0

		bench.add(`dirty flag — ${n} dep(s), clean hit`, () => {
			sink += cDirty.get()
		})

		bench.add(`version loop — ${n} dep(s), clean hit`, () => {
			sink += cVer.get()
		})

		void sink
	}

	await bench.run()

	console.log('\n── Scenario 9: Dirty flag vs version loop — clean get() overhead ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Run all benchmarks
// ---------------------------------------------------------------------------

console.log('='.repeat(70))
console.log('  Computed Dependency Tracking — Alternative Approach Benchmarks')
console.log('  Strategies: current | version-count | lazy-sub | early-bailout | ver+lazy')
console.log('='.repeat(70))

await benchPullOnlyClean()
await benchPullDirty()
await benchPushOneSub()
await benchDiamond()
await benchWideFanIn()
await benchChain()
await benchSameValueFire()
await benchCreationCost()
await benchVersionVsDirtyFlag()

console.log('='.repeat(70))
console.log('  Done.')
console.log('='.repeat(70))
