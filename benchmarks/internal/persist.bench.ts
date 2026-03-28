import { readAndMigrate, wrapForStorage } from '../../src/persist.js'
import { defineSuite, runSuites } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. wrapForStorage
// ---------------------------------------------------------------------------

const wrapSuite = defineSuite('persist-wrap', {
	'Persist: wrapForStorage': (bench) => {
		const small = { theme: 'dark' }

		const medium = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key${i}`, i]))

		const large = Object.fromEntries(
			Array.from({ length: 200 }, (_, i) => [`key${i}`, `value-${i}`]),
		)

		bench.add('wrapForStorage: primitive', () => {
			wrapForStorage(42)
		})

		bench.add('wrapForStorage: small object (1 key)', () => {
			wrapForStorage(small)
		})

		bench.add('wrapForStorage: medium object (20 keys)', () => {
			wrapForStorage(medium)
		})

		bench.add('wrapForStorage: large object (200 keys)', () => {
			wrapForStorage(large)
		})

		bench.add('wrapForStorage: medium + version envelope', () => {
			wrapForStorage(medium, 3)
		})
	},
})

// ---------------------------------------------------------------------------
// 2. readAndMigrate (no migration)
// ---------------------------------------------------------------------------

const readNoMigrationSuite = defineSuite('persist-read', {
	'Persist: readAndMigrate (no migration)': (bench) => {
		const small = { theme: 'dark' }

		const medium = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key${i}`, i]))

		const large = Object.fromEntries(
			Array.from({ length: 200 }, (_, i) => [`key${i}`, `value-${i}`]),
		)

		const rawSmall = JSON.stringify(small)

		const rawMedium = JSON.stringify(medium)

		const rawLarge = JSON.stringify(large)

		bench.add('readAndMigrate: small (no migration)', () => {
			readAndMigrate(rawSmall, { default: small })
		})

		bench.add('readAndMigrate: medium (no migration)', () => {
			readAndMigrate(rawMedium, { default: medium })
		})

		bench.add('readAndMigrate: large (no migration)', () => {
			readAndMigrate(rawLarge, { default: large })
		})
	},
})

// ---------------------------------------------------------------------------
// 3. readAndMigrate (with migration)
// ---------------------------------------------------------------------------

const readMigrationSuite = defineSuite('persist-migration', {
	'Persist: readAndMigrate (with migration)': (bench) => {
		type Versioned = { name: string; age?: number; email?: string }

		const migrations: Record<number, (old: unknown) => unknown> = {
			1: (d) => ({ ...(d as object), age: 0 }),
			2: (d) => ({ ...(d as object), email: '' }),
			3: (d) => {
				const obj = d as Versioned

				return { ...obj, name: obj.name.toUpperCase() }
			},
		}

		const v1Envelope = JSON.stringify({ v: 1, data: { name: 'alice' } })

		bench.add('readAndMigrate: 3-step migration', () => {
			readAndMigrate(v1Envelope, {
				default: { name: '', age: 0, email: '' },
				version: 4,
				migrate: migrations,
			})
		})

		const v2Envelope = JSON.stringify({ v: 2, data: { name: 'alice', age: 25 } })

		bench.add('readAndMigrate: 2-step migration', () => {
			readAndMigrate(v2Envelope, {
				default: { name: '', age: 0, email: '' },
				version: 4,
				migrate: migrations,
			})
		})

		const v3Envelope = JSON.stringify({
			v: 3,
			data: { name: 'alice', age: 25, email: 'a@b.c' },
		})

		bench.add('readAndMigrate: 1-step migration', () => {
			readAndMigrate(v3Envelope, {
				default: { name: '', age: 0, email: '' },
				version: 4,
				migrate: migrations,
			})
		})
	},
})

// ---------------------------------------------------------------------------
// 4. readAndMigrate (with validation)
// ---------------------------------------------------------------------------

const readValidationSuite = defineSuite('persist-validation', {
	'Persist: readAndMigrate (with validation)': (bench) => {
		const validRaw = JSON.stringify({ theme: 'dark', fontSize: 14 })

		bench.add('readAndMigrate: no validate', () => {
			readAndMigrate(validRaw, { default: { theme: 'light', fontSize: 12 } })
		})

		const isThemeConfig = (v: unknown): v is { theme: string; fontSize: number } =>
			typeof v === 'object' && v !== null && 'theme' in v

		bench.add('readAndMigrate: with validate (pass)', () => {
			readAndMigrate(validRaw, {
				default: { theme: 'light', fontSize: 12 },
				validate: isThemeConfig,
			})
		})

		bench.add('readAndMigrate: with validate (fail → default)', () => {
			readAndMigrate(JSON.stringify('invalid'), {
				default: { theme: 'light', fontSize: 12 },
				validate: isThemeConfig,
			})
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: Persist',
	[wrapSuite, readNoMigrationSuite, readMigrationSuite, readValidationSuite],
	'internal/persist',
).catch(console.error)
