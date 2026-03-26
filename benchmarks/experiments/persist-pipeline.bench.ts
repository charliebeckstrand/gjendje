/**
 * persist-pipeline.bench.ts
 *
 * Investigates breakthrough-level optimizations for the persistence read/write pipeline.
 *
 * The current pipeline on every cache miss:
 *   Read:  getItem → JSON.parse → isVersionedValue() → migration check → validate check → mergeKeys()
 *   Write: pickKeys() → wrapForStorage() → setItem
 *
 * For the COMMON case (no version, no migrate, no validate, no persist keys) most of
 * these steps are pure overhead — every branch is taken in the "nothing to do" direction.
 *
 * Experiments:
 *   1. Full pipeline (readAndMigrate) vs fast-path (JSON.parse only) — no features
 *   2. Full pipeline with version+migrate vs fast-path (demonstrates feature overhead)
 *   3. Read cost breakdown: JSON.parse alone vs each incremental step
 *   4. Write cost: JSON.stringify alone vs wrapForStorage overhead
 *   5. Adapter-level overhead: pickKeys + mergeKeys per call vs skipping when no persist keys
 *   6. Compile-time specialization: adapter created with vs without feature flags
 *
 * Run with: tsx benchmarks/experiments/persist-pipeline.bench.ts
 */

import { Bench } from 'tinybench'
import { mergeKeys, pickKeys, readAndMigrate, wrapForStorage } from '../../src/persist.js'
import type { StateOptions } from '../../src/types.js'
import { isRecord } from '../../src/utils.js'
import { printResults } from '../helpers.js'

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const SMALL_VALUE = { count: 42, label: 'hello', active: true }

const MEDIUM_VALUE = {
	userId: 'abc-123',
	theme: 'dark',
	language: 'en',
	notifications: true,
	fontSize: 16,
	sidebarOpen: false,
	lastSeen: '2026-03-26T10:00:00Z',
	preferences: { compact: false, highContrast: false },
}

const LARGE_VALUE: Record<string, unknown> = {}

for (let i = 0; i < 50; i++) {
	LARGE_VALUE[`field${i}`] = `value-${i}`
}

const RAW_SMALL = JSON.stringify(SMALL_VALUE)

const RAW_MEDIUM = JSON.stringify(MEDIUM_VALUE)

const RAW_LARGE = JSON.stringify(LARGE_VALUE)

// Versioned envelope (v=2 so migration would be triggered)
const RAW_VERSIONED_V1 = JSON.stringify({ v: 1, data: SMALL_VALUE })

const RAW_VERSIONED_V2 = JSON.stringify({ v: 2, data: SMALL_VALUE })

// ---------------------------------------------------------------------------
// Inline fast-path implementations (the proposed optimization)
// ---------------------------------------------------------------------------

/**
 * Fast-path read: just JSON.parse.
 * Used when: no version, no migrate, no validate, no serialize.
 */
function fastPathRead<T>(raw: string): T {
	return JSON.parse(raw) as T
}

// ---------------------------------------------------------------------------
// isVersionedValue — re-implemented inline to isolate its cost
// ---------------------------------------------------------------------------

function isVersionedValue(value: unknown): value is { v: number; data: unknown } {
	if (!isRecord(value)) return false

	return 'v' in value && 'data' in value && Number.isSafeInteger(value.v)
}

/**
 * Proposed compile-time-specialized readAndMigrate.
 *
 * At adapter creation time, select the cheapest read function based on which
 * options are actually configured. The returned function closes over only the
 * needed logic with no branches for absent features.
 */
function createSpecializedReader<T>(options: StateOptions<T>): (raw: string) => T {
	const { version, migrate, validate, serialize, persist: persistKeys } = options

	const defaultValue = options.default

	const hasVersion = version !== undefined && version > 1
	const hasMigrate = migrate !== undefined
	const hasValidate = validate !== undefined
	const hasPersistKeys = persistKeys !== undefined && persistKeys.length > 0

	// Tier 1: custom serializer — delegate entirely
	if (serialize) {
		return (raw: string) => serialize.parse(raw)
	}

	// Tier 2: no features at all — pure JSON.parse
	if (!hasVersion && !hasMigrate && !hasValidate && !hasPersistKeys) {
		return (raw: string): T => JSON.parse(raw) as T
	}

	// Tier 3: persist keys, no version/migrate/validate — parse + inline merge
	if (!hasVersion && !hasMigrate && !hasValidate && hasPersistKeys) {
		return (raw: string): T => {
			const parsed = JSON.parse(raw) as T
			return { ...(defaultValue as object), ...(parsed as object) } as T
		}
	}

	// Tier 4: full pipeline (version, migrate, validate possible) — delegate to readAndMigrate
	return (raw: string): T => readAndMigrate(raw, options)
}

/**
 * Proposed compile-time-specialized wrapForStorage.
 *
 * Returns the cheapest stringify function for the given version and persist config.
 */
function createSpecializedWriter<T>(options: StateOptions<T>): (value: T) => string {
	const { version, serialize, persist: persistKeys } = options

	// Custom serializer
	if (serialize) {
		return (value: T) => serialize.stringify(value)
	}

	// No version wrapping, no key filtering — bare JSON.stringify
	if ((!version || version === 1) && (!persistKeys || persistKeys.length === 0)) {
		return (value: T) => JSON.stringify(value)
	}

	// Has persist keys but no version wrapping — pickKeys inlined + stringify
	if ((!version || version === 1) && persistKeys && persistKeys.length > 0) {
		const boundKeys = persistKeys
		return (value: T): string => {
			if (!isRecord(value)) return JSON.stringify(value)
			const partial: Record<string, unknown> = {}
			for (const k of boundKeys) {
				if (Object.hasOwn(value, k)) partial[k] = value[k]
			}
			return JSON.stringify(partial)
		}
	}

	// Has version — use wrapForStorage (may produce envelope)
	const ver = version
	return (value: T): string => wrapForStorage(value, ver)
}

// ---------------------------------------------------------------------------
// Suite 1: Full pipeline vs fast-path — no features (small object)
// ---------------------------------------------------------------------------

async function runSuite1() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const optionsNoFeatures: StateOptions<typeof SMALL_VALUE> = {
		default: SMALL_VALUE,
	}

	bench
		.add('readAndMigrate (no features, small)', () => {
			readAndMigrate(RAW_SMALL, optionsNoFeatures)
		})
		.add('JSON.parse fast-path (no features, small)', () => {
			fastPathRead<typeof SMALL_VALUE>(RAW_SMALL)
		})
		.add('specialized reader — tier 2 (no features, small)', () => {
			createSpecializedReader(optionsNoFeatures)(RAW_SMALL)
		})

	await bench.run()

	console.log('── Suite 1: Read pipeline — no features (small object) ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Suite 2: Full pipeline vs fast-path — medium object
// ---------------------------------------------------------------------------

async function runSuite2() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const optionsNoFeatures: StateOptions<typeof MEDIUM_VALUE> = {
		default: MEDIUM_VALUE,
	}

	bench
		.add('readAndMigrate (no features, medium)', () => {
			readAndMigrate(RAW_MEDIUM, optionsNoFeatures)
		})
		.add('JSON.parse fast-path (no features, medium)', () => {
			fastPathRead<typeof MEDIUM_VALUE>(RAW_MEDIUM)
		})

	await bench.run()

	console.log('── Suite 2: Read pipeline — no features (medium object) ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Suite 3: Full pipeline vs fast-path — large object (50 keys)
// ---------------------------------------------------------------------------

async function runSuite3() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const optionsNoFeatures: StateOptions<typeof LARGE_VALUE> = {
		default: LARGE_VALUE,
	}

	bench
		.add('readAndMigrate (no features, large)', () => {
			readAndMigrate(RAW_LARGE, optionsNoFeatures)
		})
		.add('JSON.parse fast-path (no features, large)', () => {
			fastPathRead<typeof LARGE_VALUE>(RAW_LARGE)
		})

	await bench.run()

	console.log('── Suite 3: Read pipeline — no features (large object 50 keys) ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Suite 4: With version+migrate configured
// ---------------------------------------------------------------------------

async function runSuite4() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// v2 with a migrate function — storedVersion=1 triggers migration
	const optionsWithMigrate: StateOptions<typeof SMALL_VALUE> = {
		default: SMALL_VALUE,
		version: 2,
		migrate: {
			1: (old: unknown) => old, // identity migration
		},
	}

	// v2 but stored data is already v2 — migration skipped
	const optionsWithMigrateNoOp: StateOptions<typeof SMALL_VALUE> = {
		default: SMALL_VALUE,
		version: 2,
		migrate: {
			1: (old: unknown) => old,
		},
	}

	bench
		.add('readAndMigrate (v2+migrate, stored v1 — migrates)', () => {
			readAndMigrate(RAW_VERSIONED_V1, optionsWithMigrate)
		})
		.add('readAndMigrate (v2+migrate, stored v2 — no migrate)', () => {
			readAndMigrate(RAW_VERSIONED_V2, optionsWithMigrateNoOp)
		})
		.add('JSON.parse fast-path (would skip migration)', () => {
			// What the fast path costs — the baseline for how cheap we could be
			fastPathRead<typeof SMALL_VALUE>(RAW_VERSIONED_V1)
		})

	await bench.run()

	console.log('── Suite 4: Read pipeline — with version + migrate ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Suite 5: Read cost breakdown — each step in isolation
// ---------------------------------------------------------------------------

async function runSuite5() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const parsedSmall = JSON.parse(RAW_SMALL) as typeof SMALL_VALUE

	const parsedVersioned = JSON.parse(RAW_VERSIONED_V1) as unknown

	bench
		.add('JSON.parse alone (small)', () => {
			JSON.parse(RAW_SMALL)
		})
		.add('JSON.parse + isVersionedValue check', () => {
			const parsed = JSON.parse(RAW_SMALL)
			isVersionedValue(parsed)
		})
		.add('isVersionedValue alone (non-versioned object)', () => {
			isVersionedValue(parsedSmall)
		})
		.add('isVersionedValue alone (versioned envelope)', () => {
			isVersionedValue(parsedVersioned)
		})
		.add('isRecord alone', () => {
			isRecord(parsedSmall)
		})
		.add('JSON.parse + isVersionedValue + migration branch (no migrate)', () => {
			const parsed = JSON.parse(RAW_SMALL)
			const isV = isVersionedValue(parsed)
			const data = isV ? (parsed as { data: unknown }).data : parsed
			// Simulate: storedVersion < currentVersion && options.migrate — always false here
			const storedVersion = isV ? (parsed as { v: number }).v : 1
			const currentVersion = 1
			if (storedVersion < currentVersion) {
				// never taken
				void data
			}
		})
		.add('mergeKeys (no keys — fast exit)', () => {
			mergeKeys(parsedSmall, SMALL_VALUE, undefined)
		})
		.add('pickKeys (no keys — fast exit)', () => {
			pickKeys(parsedSmall, undefined)
		})

	await bench.run()

	console.log('── Suite 5: Read cost breakdown — step-by-step ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Suite 6: Write cost — JSON.stringify vs wrapForStorage overhead
// ---------------------------------------------------------------------------

async function runSuite6() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	bench
		// Version = 1 (default) — wrapForStorage should just call JSON.stringify
		.add('wrapForStorage (version=undefined)', () => {
			wrapForStorage(SMALL_VALUE, undefined)
		})
		.add('wrapForStorage (version=1)', () => {
			wrapForStorage(SMALL_VALUE, 1)
		})
		.add('JSON.stringify direct (baseline)', () => {
			JSON.stringify(SMALL_VALUE)
		})
		// Version = 2 — wraps in envelope
		.add('wrapForStorage (version=2)', () => {
			wrapForStorage(SMALL_VALUE, 2)
		})
		.add('JSON.stringify envelope manually', () => {
			JSON.stringify({ v: 2, data: SMALL_VALUE })
		})

	await bench.run()

	console.log('── Suite 6: Write cost — wrapForStorage vs JSON.stringify ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Suite 7: Adapter-level overhead — pickKeys + mergeKeys per call
// ---------------------------------------------------------------------------

async function runSuite7() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const persistKeys = ['theme', 'language', 'notifications']

	const parsedMedium = JSON.parse(RAW_MEDIUM) as typeof MEDIUM_VALUE

	bench
		// Write path with no persist keys
		.add('write: pickKeys(value, undefined) — no-op check', () => {
			pickKeys(MEDIUM_VALUE, undefined)
		})
		// Write path with persist keys
		.add('write: pickKeys(value, keys) — filters 3 of 8 keys', () => {
			pickKeys(MEDIUM_VALUE, persistKeys)
		})
		// Read path with no persist keys
		.add('read: mergeKeys(stored, default, undefined) — no-op check', () => {
			mergeKeys(parsedMedium, MEDIUM_VALUE, undefined)
		})
		// Read path with persist keys
		.add('read: mergeKeys(stored, default, keys) — merges object', () => {
			mergeKeys(parsedMedium, MEDIUM_VALUE, persistKeys)
		})
		// Inlined fast-path: skip the function call entirely for undefined keys
		.add('write: JSON.stringify direct (inlined fast-path)', () => {
			JSON.stringify(MEDIUM_VALUE)
		})
		.add('read: JSON.parse direct (inlined fast-path)', () => {
			JSON.parse(RAW_MEDIUM)
		})

	await bench.run()

	console.log('── Suite 7: Adapter-level overhead — pickKeys + mergeKeys ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Suite 8: Specialized reader/writer — compile-time dispatch overhead
// ---------------------------------------------------------------------------

async function runSuite8() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const optionsNoFeatures: StateOptions<typeof SMALL_VALUE> = {
		default: SMALL_VALUE,
	}

	const optionsWithPersist: StateOptions<typeof MEDIUM_VALUE> = {
		default: MEDIUM_VALUE,
		persist: ['theme', 'language', 'notifications'],
	}

	const optionsWithVersion: StateOptions<typeof SMALL_VALUE> = {
		default: SMALL_VALUE,
		version: 2,
		migrate: { 1: (old) => old },
	}

	// Pre-create the specialized functions (simulates compile-time adapter creation)
	const readerNoFeatures = createSpecializedReader(optionsNoFeatures)

	const readerWithPersist = createSpecializedReader(optionsWithPersist)

	const readerWithVersion = createSpecializedReader(optionsWithVersion)

	const writerNoFeatures = createSpecializedWriter(optionsNoFeatures)

	const writerWithPersist = createSpecializedWriter(optionsWithPersist)

	const writerWithVersion = createSpecializedWriter(optionsWithVersion)

	bench
		// Read: no features
		.add('specialized reader (no features) — tier 2 fast-path', () => {
			readerNoFeatures(RAW_SMALL)
		})
		.add('readAndMigrate (no features) — current baseline', () => {
			readAndMigrate(RAW_SMALL, optionsNoFeatures)
		})
		// Read: persist keys
		.add('specialized reader (persist keys) — tier 3 fast-path', () => {
			readerWithPersist(RAW_MEDIUM)
		})
		.add('readAndMigrate + mergeKeys (persist keys) — current', () => {
			const v = readAndMigrate(RAW_MEDIUM, optionsWithPersist)
			mergeKeys(v, MEDIUM_VALUE, optionsWithPersist.persist)
		})
		// Read: version + migrate
		.add('specialized reader (v2 + migrate) — full pipeline', () => {
			readerWithVersion(RAW_VERSIONED_V1)
		})
		// Write: no features
		.add('specialized writer (no features) — bare JSON.stringify', () => {
			writerNoFeatures(SMALL_VALUE)
		})
		.add('wrapForStorage (no features) — current baseline', () => {
			wrapForStorage(SMALL_VALUE, undefined)
		})
		// Write: persist keys
		.add('specialized writer (persist keys) — inlined pickKeys+stringify', () => {
			writerWithPersist(MEDIUM_VALUE)
		})
		.add('pickKeys + wrapForStorage (persist keys) — current', () => {
			const toStore = pickKeys(MEDIUM_VALUE, optionsWithPersist.persist)
			wrapForStorage(toStore, undefined)
		})
		// Write: version 2
		.add('specialized writer (version=2) — envelope', () => {
			writerWithVersion(SMALL_VALUE)
		})
		.add('wrapForStorage (version=2) — current', () => {
			wrapForStorage(SMALL_VALUE, 2)
		})

	await bench.run()

	console.log('── Suite 8: Specialized reader/writer vs current ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Suite 9: End-to-end full read+write cycle — no features vs fast-path
// ---------------------------------------------------------------------------

async function runSuite9() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const optionsNoFeatures: StateOptions<typeof MEDIUM_VALUE> = {
		default: MEDIUM_VALUE,
	}

	let counter = 0

	bench
		.add('full cycle: write (wrapForStorage) + read (readAndMigrate) — current', () => {
			const val = { ...MEDIUM_VALUE, userId: `user-${counter++}` }
			const raw = wrapForStorage(val, undefined)
			readAndMigrate(raw, optionsNoFeatures)
		})
		.add('full cycle: write (JSON.stringify) + read (JSON.parse) — fast-path', () => {
			const val = { ...MEDIUM_VALUE, userId: `user-${counter++}` }
			const raw = JSON.stringify(val)
			JSON.parse(raw)
		})
		.add('full cycle: write (pickKeys+wrap) + read (readAndMigrate+mergeKeys) — persist', () => {
			const val = { ...MEDIUM_VALUE, userId: `user-${counter++}` }
			const toStore = pickKeys(val, ['theme', 'language'])
			const raw = wrapForStorage(toStore, undefined)
			const parsed = readAndMigrate(raw, optionsNoFeatures)
			mergeKeys(parsed, MEDIUM_VALUE, ['theme', 'language'])
		})
		.add('full cycle: write (inlined) + read (inlined) — persist fast-path', () => {
			const val = { ...MEDIUM_VALUE, userId: `user-${counter++}` }
			// Inlined pickKeys
			const partial: Record<string, unknown> = {}
			if (isRecord(val)) {
				for (const k of ['theme', 'language']) {
					if (Object.hasOwn(val, k)) partial[k] = (val as Record<string, unknown>)[k]
				}
			}
			const raw = JSON.stringify(partial)
			// Inlined parse + mergeKeys
			const parsed = JSON.parse(raw) as typeof MEDIUM_VALUE
			const merged = { ...(MEDIUM_VALUE as object), ...(parsed as object) } as typeof MEDIUM_VALUE
			void merged
		})

	await bench.run()

	console.log('── Suite 9: End-to-end read+write cycle ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Run all suites
// ---------------------------------------------------------------------------

async function main() {
	console.log('='.repeat(70))
	console.log('  Persist Pipeline — Optimization Experiment')
	console.log('  Tests fast-path specialization against current readAndMigrate/wrapForStorage')
	console.log('='.repeat(70))

	await runSuite1()
	await runSuite2()
	await runSuite3()
	await runSuite4()
	await runSuite5()
	await runSuite6()
	await runSuite7()
	await runSuite8()
	await runSuite9()

	console.log('='.repeat(70))
	console.log('  Done.')
	console.log('='.repeat(70))
}

main().catch(console.error)
