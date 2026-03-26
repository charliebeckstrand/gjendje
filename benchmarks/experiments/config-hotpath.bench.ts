/**
 * config-hotpath.bench.ts
 *
 * Investigates the overhead of config/options callback checks on MemoryStateImpl.set().
 *
 * Every set() call currently checks:
 *   - this._config.onIntercept?.(...) — inside interceptor block (gated by ext check)
 *   - this._config.onChange?.(...) — unconditional optional chain
 *   - this._options.isEqual?.(...) — unconditional optional chain
 *
 * And reset() additionally checks:
 *   - this._config.onReset?.(...) — unconditional optional chain
 *
 * The global config is typically {} (empty) — all callbacks are undefined.
 * This benchmark tests four alternative strategies to eliminate that overhead:
 *
 *   1. BITFIELD: Integer bitfield (HAS_ON_CHANGE | HAS_IS_EQUAL | etc.) stored
 *      at construction time. Check `bits & FLAG` before calling the handler.
 *
 *   2. NULL_FUNCTION: Pre-fill absent callbacks with a shared no-op function.
 *      Eliminates the `?.` branch: call config.onChange() unconditionally.
 *
 *   3. HAS_MIDDLEWARE_FLAG: Single boolean `_hasMiddleware` true when ANY of
 *      onChange/isEqual/onIntercept/interceptors/changeHandlers exist.
 *      One branch skips all checks.
 *
 *   4. CONFIG_SNAPSHOT: Snapshot config callbacks into plain local fields at
 *      construction time (avoid re-reading this._config on every set()).
 *
 * Three scenarios per strategy:
 *   A. Empty config (the dominant real-world case)
 *   B. onChange configured
 *   C. isEqual configured
 *
 * Run with: tsx benchmarks/experiments/config-hotpath.bench.ts
 */

import { Bench } from 'tinybench'
import { notify } from '../../src/batch.js'
import { parseFlags } from '../ab.js'
import { benchConfig, printResults } from '../helpers.js'

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const flags = parseFlags(process.argv.slice(2))

if (flags.quick) {
	benchConfig.time = 500
	benchConfig.warmupTime = 100
}

// ---------------------------------------------------------------------------
// Shared types & no-op helpers
// ---------------------------------------------------------------------------

interface ChangeContext {
	key: string
	scope: string
	value: unknown
	previousValue: unknown
}

const NOOP = () => {}

// ---------------------------------------------------------------------------
// Strategy implementations
// Each makes a minimal self-contained "state cell" with:
//   - set(value) — the hot path under test
//   - A captured config / options for the scenario
// All variants produce identical observable results.
// ---------------------------------------------------------------------------

// ---- CURRENT pattern -------------------------------------------------------
// Direct optional chaining: config.onChange?.(ctx), options.isEqual?.(a, b)

function makeCurrentEmpty() {
	let current = 0
	let notifyFn: (() => void) | undefined

	const config: { onChange?: (ctx: ChangeContext) => void } = {}
	const options: { isEqual?: (a: number, b: number) => boolean } = {}
	const key = 'k'
	const scope = 'memory'

	return {
		set(value: number) {
			const prev = current

			if (options.isEqual?.(value, prev)) return

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			config.onChange?.({ key, scope, value, previousValue: prev })
		},
	}
}

function makeCurrentOnChange() {
	let current = 0
	let notifyFn: (() => void) | undefined
	let sink = 0

	const config: { onChange?: (ctx: ChangeContext) => void } = {
		onChange: (ctx) => {
			sink += ctx.value as number
		},
	}
	const options: { isEqual?: (a: number, b: number) => boolean } = {}
	const key = 'k'
	const scope = 'memory'

	return {
		set(value: number) {
			const prev = current

			if (options.isEqual?.(value, prev)) return

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			config.onChange?.({ key, scope, value, previousValue: prev })
		},
		getSink: () => sink,
	}
}

function makeCurrentIsEqual() {
	let current = 0
	let notifyFn: (() => void) | undefined

	const config: { onChange?: (ctx: ChangeContext) => void } = {}
	// isEqual always returns false so the set() proceeds
	const options: { isEqual?: (a: number, b: number) => boolean } = {
		isEqual: (a, b) => a === b,
	}
	const key = 'k'
	const scope = 'memory'

	return {
		set(value: number) {
			const prev = current

			if (options.isEqual?.(value, prev)) return

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			config.onChange?.({ key, scope, value, previousValue: prev })
		},
	}
}

// ---- Strategy 1: BITFIELD --------------------------------------------------
// Precompute an integer bitmask at construction time. Also snapshot the
// callbacks into typed locals so the bit check + call avoids both the
// optional chain AND a property lookup on each invocation.
//
// In a real implementation these would be instance fields (e.g. _bits, _onChange).

const BIT_ON_CHANGE = 1 << 0 // 0b001
const BIT_IS_EQUAL = 1 << 1 // 0b010

function makeBitfieldEmpty() {
	let current = 0
	let notifyFn: (() => void) | undefined

	const config: { onChange?: (ctx: ChangeContext) => void } = {}
	const options: { isEqual?: (a: number, b: number) => boolean } = {}
	const key = 'k'
	const scope = 'memory'

	// Computed once at "construction": bitmask + snapshotted callbacks
	let bits = 0

	if (config.onChange !== undefined) bits |= BIT_ON_CHANGE
	if (options.isEqual !== undefined) bits |= BIT_IS_EQUAL

	const _onChange = config.onChange
	const _isEqual = options.isEqual

	return {
		set(value: number) {
			const prev = current

			if (bits & BIT_IS_EQUAL && _isEqual?.(value, prev)) return

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			if (bits & BIT_ON_CHANGE) {
				_onChange?.({ key, scope, value, previousValue: prev })
			}
		},
	}
}

function makeBitfieldOnChange() {
	let current = 0
	let notifyFn: (() => void) | undefined
	let sink = 0

	const config: { onChange?: (ctx: ChangeContext) => void } = {
		onChange: (ctx) => {
			sink += ctx.value as number
		},
	}
	const options: { isEqual?: (a: number, b: number) => boolean } = {}
	const key = 'k'
	const scope = 'memory'

	let bits = 0

	if (config.onChange !== undefined) bits |= BIT_ON_CHANGE
	if (options.isEqual !== undefined) bits |= BIT_IS_EQUAL

	const _onChange = config.onChange
	const _isEqual = options.isEqual

	return {
		set(value: number) {
			const prev = current

			if (bits & BIT_IS_EQUAL && _isEqual?.(value, prev)) return

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			if (bits & BIT_ON_CHANGE) {
				_onChange?.({ key, scope, value, previousValue: prev })
			}
		},
		getSink: () => sink,
	}
}

function makeBitfieldIsEqual() {
	let current = 0
	let notifyFn: (() => void) | undefined

	const config: { onChange?: (ctx: ChangeContext) => void } = {}
	const options: { isEqual?: (a: number, b: number) => boolean } = {
		isEqual: (a, b) => a === b,
	}
	const key = 'k'
	const scope = 'memory'

	let bits = 0

	if (config.onChange !== undefined) bits |= BIT_ON_CHANGE
	if (options.isEqual !== undefined) bits |= BIT_IS_EQUAL

	const _onChange = config.onChange
	const _isEqual = options.isEqual

	return {
		set(value: number) {
			const prev = current

			if (bits & BIT_IS_EQUAL && _isEqual?.(value, prev)) return

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			if (bits & BIT_ON_CHANGE) {
				_onChange?.({ key, scope, value, previousValue: prev })
			}
		},
	}
}

// ---- Strategy 2: NULL_FUNCTION ---------------------------------------------
// Absent callbacks are replaced with a shared no-op at construction time.
// Removes the `?.` conditional: config.onChange() is always a direct call.

const NOOP_CHANGE: (ctx: ChangeContext) => void = NOOP
const NOOP_IS_EQUAL: (a: number, b: number) => boolean = () => false

function makeNullFnEmpty() {
	let current = 0
	let notifyFn: (() => void) | undefined

	// Callbacks are guaranteed non-null (filled in at "construction")
	const rawConfig: { onChange?: (ctx: ChangeContext) => void } = {}
	const rawOptions: { isEqual?: (a: number, b: number) => boolean } = {}

	const onChange = rawConfig.onChange ?? NOOP_CHANGE
	const isEqual = rawOptions.isEqual ?? NOOP_IS_EQUAL
	const key = 'k'
	const scope = 'memory'

	return {
		set(value: number) {
			const prev = current

			if (isEqual(value, prev)) return

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			onChange({ key, scope, value, previousValue: prev })
		},
	}
}

function makeNullFnOnChange() {
	let current = 0
	let notifyFn: (() => void) | undefined
	let sink = 0

	const rawConfig: { onChange?: (ctx: ChangeContext) => void } = {
		onChange: (ctx) => {
			sink += ctx.value as number
		},
	}
	const rawOptions: { isEqual?: (a: number, b: number) => boolean } = {}

	const onChange = rawConfig.onChange ?? NOOP_CHANGE
	const isEqual = rawOptions.isEqual ?? NOOP_IS_EQUAL
	const key = 'k'
	const scope = 'memory'

	return {
		set(value: number) {
			const prev = current

			if (isEqual(value, prev)) return

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			onChange({ key, scope, value, previousValue: prev })
		},
		getSink: () => sink,
	}
}

function makeNullFnIsEqual() {
	let current = 0
	let notifyFn: (() => void) | undefined

	const rawConfig: { onChange?: (ctx: ChangeContext) => void } = {}
	const rawOptions: { isEqual?: (a: number, b: number) => boolean } = {
		isEqual: (a, b) => a === b,
	}

	const onChange = rawConfig.onChange ?? NOOP_CHANGE
	const isEqual = rawOptions.isEqual ?? NOOP_IS_EQUAL
	const key = 'k'
	const scope = 'memory'

	return {
		set(value: number) {
			const prev = current

			if (isEqual(value, prev)) return

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			onChange({ key, scope, value, previousValue: prev })
		},
	}
}

// ---- Strategy 3: HAS_MIDDLEWARE_FLAG --------------------------------------
// Single boolean `_hasMiddleware`. When false (the common case), skip all
// config/options checks with a single branch.

function makeHasMiddlewareEmpty() {
	let current = 0
	let notifyFn: (() => void) | undefined

	const config: { onChange?: (ctx: ChangeContext) => void } = {}
	const options: { isEqual?: (a: number, b: number) => boolean } = {}
	const key = 'k'
	const scope = 'memory'

	const hasMiddleware = !!(config.onChange || options.isEqual)

	return {
		set(value: number) {
			const prev = current

			if (hasMiddleware) {
				if (options.isEqual?.(value, prev)) return
			}

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			if (hasMiddleware) {
				config.onChange?.({ key, scope, value, previousValue: prev })
			}
		},
	}
}

function makeHasMiddlewareOnChange() {
	let current = 0
	let notifyFn: (() => void) | undefined
	let sink = 0

	const config: { onChange?: (ctx: ChangeContext) => void } = {
		onChange: (ctx) => {
			sink += ctx.value as number
		},
	}
	const options: { isEqual?: (a: number, b: number) => boolean } = {}
	const key = 'k'
	const scope = 'memory'

	const hasMiddleware = !!(config.onChange || options.isEqual)

	return {
		set(value: number) {
			const prev = current

			if (hasMiddleware) {
				if (options.isEqual?.(value, prev)) return
			}

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			if (hasMiddleware) {
				config.onChange?.({ key, scope, value, previousValue: prev })
			}
		},
		getSink: () => sink,
	}
}

function makeHasMiddlewareIsEqual() {
	let current = 0
	let notifyFn: (() => void) | undefined

	const config: { onChange?: (ctx: ChangeContext) => void } = {}
	const options: { isEqual?: (a: number, b: number) => boolean } = {
		isEqual: (a, b) => a === b,
	}
	const key = 'k'
	const scope = 'memory'

	const hasMiddleware = !!(config.onChange || options.isEqual)

	return {
		set(value: number) {
			const prev = current

			if (hasMiddleware) {
				if (options.isEqual?.(value, prev)) return
			}

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			if (hasMiddleware) {
				config.onChange?.({ key, scope, value, previousValue: prev })
			}
		},
	}
}

// ---- Strategy 4: CONFIG_SNAPSHOT ------------------------------------------
// Snapshot config/options callbacks into local fields at construction time.
// Avoids property lookup through `this._config` / `this._options` on each call.
// Also replaces undefined with undefined — this is about eliminating the
// prototype-chain property access overhead, not the null check itself.

function makeSnapshotEmpty() {
	let current = 0
	let notifyFn: (() => void) | undefined

	const config: { onChange?: (ctx: ChangeContext) => void } = {}
	const options: { isEqual?: (a: number, b: number) => boolean } = {}

	// Snapshot at "construction"
	const _onChange = config.onChange
	const _isEqual = options.isEqual
	const key = 'k'
	const scope = 'memory'

	return {
		set(value: number) {
			const prev = current

			if (_isEqual?.(value, prev)) return

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			_onChange?.({ key, scope, value, previousValue: prev })
		},
	}
}

function makeSnapshotOnChange() {
	let current = 0
	let notifyFn: (() => void) | undefined
	let sink = 0

	const config: { onChange?: (ctx: ChangeContext) => void } = {
		onChange: (ctx) => {
			sink += ctx.value as number
		},
	}
	const options: { isEqual?: (a: number, b: number) => boolean } = {}

	const _onChange = config.onChange
	const _isEqual = options.isEqual
	const key = 'k'
	const scope = 'memory'

	return {
		set(value: number) {
			const prev = current

			if (_isEqual?.(value, prev)) return

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			_onChange?.({ key, scope, value, previousValue: prev })
		},
		getSink: () => sink,
	}
}

function makeSnapshotIsEqual() {
	let current = 0
	let notifyFn: (() => void) | undefined

	const config: { onChange?: (ctx: ChangeContext) => void } = {}
	const options: { isEqual?: (a: number, b: number) => boolean } = {
		isEqual: (a, b) => a === b,
	}

	const _onChange = config.onChange
	const _isEqual = options.isEqual
	const key = 'k'
	const scope = 'memory'

	return {
		set(value: number) {
			const prev = current

			if (_isEqual?.(value, prev)) return

			current = value

			if (notifyFn !== undefined) notify(notifyFn)

			_onChange?.({ key, scope, value, previousValue: prev })
		},
	}
}

// ---------------------------------------------------------------------------
// Scenario A: set() with empty config (the dominant real-world case)
// ---------------------------------------------------------------------------

async function benchEmptyConfig() {
	const bench = new Bench(benchConfig)

	const current = makeCurrentEmpty()
	const bitfield = makeBitfieldEmpty()
	const nullFn = makeNullFnEmpty()
	const hasMw = makeHasMiddlewareEmpty()
	const snapshot = makeSnapshotEmpty()

	let i = 0

	bench.add('current — optional chaining, empty config', () => {
		current.set(i++)
	})

	bench.add('bitfield — integer bit test, empty config', () => {
		bitfield.set(i++)
	})

	bench.add('null-fn — no-op default, empty config', () => {
		nullFn.set(i++)
	})

	bench.add('has-middleware — single bool, empty config', () => {
		hasMw.set(i++)
	})

	bench.add('snapshot — local field cache, empty config', () => {
		snapshot.set(i++)
	})

	await bench.run()

	console.log('\n── Scenario A: set() with empty config (no callbacks) ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Scenario B: set() with onChange configured
// ---------------------------------------------------------------------------

async function benchOnChange() {
	const bench = new Bench(benchConfig)

	const current = makeCurrentOnChange()
	const bitfield = makeBitfieldOnChange()
	const nullFn = makeNullFnOnChange()
	const hasMw = makeHasMiddlewareOnChange()
	const snapshot = makeSnapshotOnChange()

	let i = 0

	bench.add('current — optional chaining, onChange set', () => {
		current.set(i++)
	})

	bench.add('bitfield — integer bit test, onChange set', () => {
		bitfield.set(i++)
	})

	bench.add('null-fn — no-op default, onChange set', () => {
		nullFn.set(i++)
	})

	bench.add('has-middleware — single bool, onChange set', () => {
		hasMw.set(i++)
	})

	bench.add('snapshot — local field cache, onChange set', () => {
		snapshot.set(i++)
	})

	await bench.run()

	console.log('\n── Scenario B: set() with onChange configured ──')
	printResults(bench)

	// Consume sinks to prevent dead-code elimination
	void current.getSink()
	void bitfield.getSink()
	void nullFn.getSink()
	void hasMw.getSink()
	void snapshot.getSink()
}

// ---------------------------------------------------------------------------
// Scenario C: set() with isEqual configured (always returns false so set proceeds)
// ---------------------------------------------------------------------------

async function benchIsEqual() {
	const bench = new Bench(benchConfig)

	const current = makeCurrentIsEqual()
	const bitfield = makeBitfieldIsEqual()
	const nullFn = makeNullFnIsEqual()
	const hasMw = makeHasMiddlewareIsEqual()
	const snapshot = makeSnapshotIsEqual()

	let i = 0

	bench.add('current — optional chaining, isEqual set', () => {
		current.set(i++)
	})

	bench.add('bitfield — integer bit test, isEqual set', () => {
		bitfield.set(i++)
	})

	bench.add('null-fn — no-op default, isEqual set', () => {
		nullFn.set(i++)
	})

	bench.add('has-middleware — single bool, isEqual set', () => {
		hasMw.set(i++)
	})

	bench.add('snapshot — local field cache, isEqual set', () => {
		snapshot.set(i++)
	})

	await bench.run()

	console.log('\n── Scenario C: set() with isEqual configured ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Scenario D: reset() with empty config vs onReset overhead
// Mirrors the extra this._config.onReset?.() check in MemoryStateImpl.reset()
// ---------------------------------------------------------------------------

async function benchReset() {
	const bench = new Bench(benchConfig)

	// Current reset pattern: optional chains against config properties
	function makeCurrentReset() {
		let current = 0
		const defaultValue = 0
		let notifyFn: (() => void) | undefined

		const config: {
			onChange?: (ctx: ChangeContext) => void
			onReset?: (ctx: { key: string; scope: string; previousValue: unknown }) => void
		} = {}
		const options: { isEqual?: (a: number, b: number) => boolean } = {}
		const key = 'k'
		const scope = 'memory'

		return {
			set(value: number) {
				current = value
			},
			reset() {
				const prev = current
				const next = defaultValue

				if (options.isEqual?.(next, prev)) return

				current = next

				if (notifyFn !== undefined) notify(notifyFn)

				config.onReset?.({ key, scope, previousValue: prev })
				config.onChange?.({ key, scope, value: next, previousValue: prev })
			},
		}
	}

	// Bitfield reset pattern
	function makeBitfieldReset() {
		let current = 0
		const defaultValue = 0
		let notifyFn: (() => void) | undefined

		const config: {
			onChange?: (ctx: ChangeContext) => void
			onReset?: (ctx: { key: string; scope: string; previousValue: unknown }) => void
		} = {}
		const options: { isEqual?: (a: number, b: number) => boolean } = {}
		const key = 'k'
		const scope = 'memory'

		const BIT_RESET = 1 << 2

		let bits = 0

		if (config.onChange !== undefined) bits |= BIT_ON_CHANGE
		if (options.isEqual !== undefined) bits |= BIT_IS_EQUAL
		if (config.onReset !== undefined) bits |= BIT_RESET

		const _onChange = config.onChange
		const _onReset = config.onReset
		const _isEqual = options.isEqual

		return {
			set(value: number) {
				current = value
			},
			reset() {
				const prev = current
				const next = defaultValue

				if (bits & BIT_IS_EQUAL && _isEqual?.(next, prev)) return

				current = next

				if (notifyFn !== undefined) notify(notifyFn)

				if (bits & BIT_RESET) _onReset?.({ key, scope, previousValue: prev })
				if (bits & BIT_ON_CHANGE) _onChange?.({ key, scope, value: next, previousValue: prev })
			},
		}
	}

	// Has-middleware reset pattern
	function makeHasMiddlewareReset() {
		let current = 0
		const defaultValue = 0
		let notifyFn: (() => void) | undefined

		const config: {
			onChange?: (ctx: ChangeContext) => void
			onReset?: (ctx: { key: string; scope: string; previousValue: unknown }) => void
		} = {}
		const options: { isEqual?: (a: number, b: number) => boolean } = {}
		const key = 'k'
		const scope = 'memory'

		const hasMiddleware = !!(config.onChange || config.onReset || options.isEqual)

		return {
			set(value: number) {
				current = value
			},
			reset() {
				const prev = current
				const next = defaultValue

				if (hasMiddleware) {
					if (options.isEqual?.(next, prev)) return
				}

				current = next

				if (notifyFn !== undefined) notify(notifyFn)

				if (hasMiddleware) {
					config.onReset?.({ key, scope, previousValue: prev })
					config.onChange?.({ key, scope, value: next, previousValue: prev })
				}
			},
		}
	}

	const cr = makeCurrentReset()
	const br = makeBitfieldReset()
	const hr = makeHasMiddlewareReset()

	// Vary values so reset() always proceeds (prev !== default triggers update path)
	let i = 1

	bench.add('reset() current — optional chaining, empty config', () => {
		cr.set(i++)
		cr.reset()
	})

	bench.add('reset() bitfield — integer bit test, empty config', () => {
		br.set(i++)
		br.reset()
	})

	bench.add('reset() has-middleware — single bool, empty config', () => {
		hr.set(i++)
		hr.reset()
	})

	await bench.run()

	console.log('\n── Scenario D: reset() with empty config ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Scenario E: Combined overhead — isolate the raw optional-chain cost
// Compare: obj.prop?.() vs (bits & BIT) && obj.prop!()
// on a tight loop with no other work, to measure the raw dispatch cost.
// ---------------------------------------------------------------------------

async function benchRawDispatchCost() {
	const bench = new Bench(benchConfig)

	// Simulate what the JIT sees: repeated check on the same object
	const configEmpty: { onChange?: (ctx: ChangeContext) => void } = {}
	const configFilled: { onChange?: (ctx: ChangeContext) => void } = {
		onChange: NOOP as (ctx: ChangeContext) => void,
	}

	const ctx: ChangeContext = { key: 'k', scope: 'memory', value: 0, previousValue: 0 }

	const bitsEmpty = 0
	const bitsFilled = BIT_ON_CHANGE

	bench.add('raw optional chain — config empty (undefined?.())', () => {
		configEmpty.onChange?.(ctx)
	})

	bench.add('raw optional chain — config filled (fn?.())', () => {
		configFilled.onChange?.(ctx)
	})

	// For the raw bitfield tests we also snapshot the callback, mirroring the
	// realistic implementation where bits + snapshotted ref are stored together.
	const snapshotEmpty = configEmpty.onChange
	const snapshotFilled = configFilled.onChange

	bench.add('raw bitfield — config empty (bits & BIT === 0)', () => {
		if (bitsEmpty & BIT_ON_CHANGE) snapshotEmpty?.(ctx)
	})

	bench.add('raw bitfield — config filled (bits & BIT !== 0)', () => {
		if (bitsFilled & BIT_ON_CHANGE) snapshotFilled?.(ctx)
	})

	bench.add('raw null-fn — empty (NOOP call)', () => {
		const fn = configEmpty.onChange ?? NOOP_CHANGE
		fn(ctx)
	})

	bench.add('raw null-fn — filled (real fn call)', () => {
		const fn = configFilled.onChange ?? NOOP_CHANGE
		fn(ctx)
	})

	bench.add('raw has-middleware false — skip block', () => {
		const hasMiddleware = false
		if (hasMiddleware) configEmpty.onChange?.(ctx)
	})

	bench.add('raw has-middleware true — enter block + optional chain', () => {
		const hasMiddleware = true
		if (hasMiddleware) configFilled.onChange?.(ctx)
	})

	await bench.run()

	console.log('\n── Scenario E: raw dispatch cost — optional chain vs alternatives ──')
	printResults(bench)

	// Prevent dead-code elimination
	void bitsEmpty
	void bitsFilled
}

// ---------------------------------------------------------------------------
// Run all benchmarks
// ---------------------------------------------------------------------------

console.log('='.repeat(70))
console.log('  Config Hot-Path — Callback Dispatch Strategy Benchmarks')
console.log('  Investigating: optional chaining vs bitfield vs null-fn vs flag vs snapshot')
console.log('='.repeat(70))

await benchEmptyConfig()
await benchOnChange()
await benchIsEqual()
await benchReset()
await benchRawDispatchCost()

console.log('='.repeat(70))
console.log('  Done.')
console.log('='.repeat(70))
