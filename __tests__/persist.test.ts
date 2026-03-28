import { beforeEach, describe, expect, it } from 'vitest'
import { state } from '../src/index.js'
import { makeStorage } from './helpers.js'

beforeEach(() => {
	Object.defineProperty(globalThis, 'localStorage', {
		value: makeStorage(),
		configurable: true,
	})

	Object.defineProperty(globalThis, 'window', {
		value: { addEventListener: () => {}, removeEventListener: () => {} },
		configurable: true,
		writable: true,
	})

	Object.defineProperty(globalThis, 'BroadcastChannel', {
		value: class {
			onmessage = null
			postMessage() {}
			close() {}
		},
		configurable: true,
	})
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('validate', () => {
	it('returns stored value when validation passes', () => {
		localStorage.setItem('p-val-pass', '42')

		const count = state('p-val-pass', {
			default: 0,
			scope: 'local',
			validate: (v): v is number => typeof v === 'number',
		})

		expect(count.get()).toBe(42)

		count.destroy()
	})

	it('falls back to default when validation fails', () => {
		localStorage.setItem('p-val-fail', '"not-a-number"')

		const count = state('p-val-fail', {
			default: 0,
			scope: 'local',
			validate: (v): v is number => typeof v === 'number',
		})

		expect(count.get()).toBe(0)

		count.destroy()
	})

	it('falls back to default when stored object has wrong shape', () => {
		localStorage.setItem('p-val-shape', JSON.stringify({ theme: 123, fontSize: 'big' }))

		interface Prefs {
			theme: string
			fontSize: number
		}

		const prefs = state('p-val-shape', {
			default: { theme: 'light', fontSize: 14 } as Prefs,
			scope: 'local',
			validate: (v): v is Prefs =>
				v !== null &&
				typeof v === 'object' &&
				typeof (v as Prefs).theme === 'string' &&
				typeof (v as Prefs).fontSize === 'number',
		})

		expect(prefs.get()).toEqual({ theme: 'light', fontSize: 14 })

		prefs.destroy()
	})

	it('accepts a valid complex object', () => {
		interface Prefs {
			theme: string
			fontSize: number
		}

		localStorage.setItem('p-val-ok', JSON.stringify({ theme: 'dark', fontSize: 16 }))

		const prefs = state('p-val-ok', {
			default: { theme: 'light', fontSize: 14 } as Prefs,
			scope: 'local',
			validate: (v): v is Prefs =>
				v !== null &&
				typeof v === 'object' &&
				typeof (v as Prefs).theme === 'string' &&
				typeof (v as Prefs).fontSize === 'number',
		})

		expect(prefs.get()).toEqual({ theme: 'dark', fontSize: 16 })

		prefs.destroy()
	})
})

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

describe('migrate', () => {
	it('migrates a v1 value to v2', () => {
		localStorage.setItem('p-mig-v1', JSON.stringify({ theme: 'dark' }))

		interface PrefsV2 {
			theme: string
			fontSize: number
		}

		const prefs = state('p-mig-v1', {
			default: { theme: 'light', fontSize: 14 } as PrefsV2,
			scope: 'local',
			version: 2,
			migrate: {
				1: (old) => ({ ...(old as object), fontSize: 14 }),
			},
		})

		expect(prefs.get()).toEqual({ theme: 'dark', fontSize: 14 })

		prefs.destroy()
	})

	it('migrates through multiple versions in sequence', () => {
		localStorage.setItem('p-mig-multi', JSON.stringify({ theme: 'dark' }))

		interface PrefsV3 {
			theme: string
			fontSize: number
			compact: boolean
		}

		const prefs = state('p-mig-multi', {
			default: { theme: 'light', fontSize: 14, compact: false } as PrefsV3,
			scope: 'local',
			version: 3,
			migrate: {
				1: (old) => ({ ...(old as object), fontSize: 14 }),
				2: (old) => ({ ...(old as object), compact: false }),
			},
		})

		expect(prefs.get()).toEqual({ theme: 'dark', fontSize: 14, compact: false })

		prefs.destroy()
	})

	it('reads a current version value without migrating', () => {
		localStorage.setItem(
			'p-mig-current',
			JSON.stringify({
				v: 2,
				data: { theme: 'dark', fontSize: 16 },
			}),
		)

		interface PrefsV2 {
			theme: string
			fontSize: number
		}

		const prefs = state('p-mig-current', {
			default: { theme: 'light', fontSize: 14 } as PrefsV2,
			scope: 'local',
			version: 2,
			migrate: {
				1: (old) => ({ ...(old as object), fontSize: 14 }),
			},
		})

		expect(prefs.get()).toEqual({ theme: 'dark', fontSize: 16 })

		prefs.destroy()
	})

	it('falls back to default when migration throws', () => {
		localStorage.setItem('p-mig-throw', JSON.stringify({ theme: 'dark' }))

		interface PrefsV2 {
			theme: string
			fontSize: number
		}

		const prefs = state('p-mig-throw', {
			default: { theme: 'light', fontSize: 14 } as PrefsV2,
			scope: 'local',
			version: 2,
			migrate: {
				1: () => {
					throw new Error('migration failed')
				},
			},
			validate: (v): v is PrefsV2 => typeof (v as PrefsV2)?.fontSize === 'number',
		})

		expect(prefs.get()).toEqual({ theme: 'light', fontSize: 14 })

		prefs.destroy()
	})

	it('writes new values with a version envelope', () => {
		const prefs = state('p-mig-envelope', {
			default: { theme: 'light', fontSize: 14 },
			scope: 'local',
			version: 2,
		})

		prefs.set({ theme: 'dark', fontSize: 16 })

		const raw = localStorage.getItem('p-mig-envelope')
		const parsed = JSON.parse(raw ?? '')

		expect(parsed.v).toBe(2)
		expect(parsed.data).toEqual({ theme: 'dark', fontSize: 16 })

		prefs.destroy()
	})
})

// ---------------------------------------------------------------------------
// Custom serializer error handling
// ---------------------------------------------------------------------------

describe('custom serializer errors', () => {
	it('falls back to default when custom parse() throws', () => {
		localStorage.setItem('p-ser-throw', '"stored-value"')

		const x = state('p-ser-throw', {
			default: 'fallback',
			scope: 'local',
			serialize: {
				stringify: (v: string) => JSON.stringify(v),
				parse: () => {
					throw new Error('parse failed')
				},
			},
		})

		expect(x.get()).toBe('fallback')

		x.destroy()
	})

	it('silently handles stringify() throwing on write', () => {
		const x = state('p-ser-write-throw', {
			default: 'initial',
			scope: 'local',
			serialize: {
				stringify: () => {
					throw new Error('stringify failed')
				},
				parse: (raw: string) => JSON.parse(raw) as string,
			},
		})

		// Should not throw — write failures are silent
		expect(() => x.set('new-value')).not.toThrow()

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// Validation + migration together
// ---------------------------------------------------------------------------

describe('validate + migrate', () => {
	it('falls back to default if value is invalid after migration', () => {
		localStorage.setItem('p-vm-fail', JSON.stringify({ theme: 'dark' }))

		interface PrefsV2 {
			theme: string
			fontSize: number
		}

		const prefs = state('p-vm-fail', {
			default: { theme: 'light', fontSize: 14 } as PrefsV2,
			scope: 'local',
			version: 2,
			migrate: {
				// Bad migration — doesn't add fontSize
				1: (old) => old,
			},
			validate: (v): v is PrefsV2 => typeof (v as PrefsV2)?.fontSize === 'number',
		})

		expect(prefs.get()).toEqual({ theme: 'light', fontSize: 14 })

		prefs.destroy()
	})

	it('returns migrated value when validation passes', () => {
		localStorage.setItem('p-vm-pass', JSON.stringify({ theme: 'dark' }))

		interface PrefsV2 {
			theme: string
			fontSize: number
		}

		const prefs = state('p-vm-pass', {
			default: { theme: 'light', fontSize: 14 } as PrefsV2,
			scope: 'local',
			version: 2,
			migrate: {
				1: (old) => ({ ...(old as object), fontSize: 14 }),
			},
			validate: (v): v is PrefsV2 => typeof (v as PrefsV2)?.fontSize === 'number',
		})

		expect(prefs.get()).toEqual({ theme: 'dark', fontSize: 14 })

		prefs.destroy()
	})
})

// ---------------------------------------------------------------------------
// Persist edge cases
// ---------------------------------------------------------------------------

describe('persist edge cases', () => {
	it('rejects versioned envelope with non-integer v', () => {
		localStorage.setItem('p-nonint-v', JSON.stringify({ v: 1.5, data: 'hello' }))

		const s = state('p-nonint-v', {
			default: 'fallback',
			scope: 'local',
		})

		expect(s.get()).toEqual({ v: 1.5, data: 'hello' })

		s.destroy()
	})

	it('rejects versioned envelope with extra keys', () => {
		localStorage.setItem('p-extra-keys', JSON.stringify({ v: 1, data: 'hello', extra: true }))

		const s = state('p-extra-keys', {
			default: 'fallback',
			scope: 'local',
		})

		expect(s.get()).toEqual({ v: 1, data: 'hello', extra: true })

		s.destroy()
	})

	it('writes version envelope for version > 1', () => {
		const s = state('p-env-v3', {
			default: 'initial',
			scope: 'local',
			version: 3,
		})

		s.set('test')

		const raw = localStorage.getItem('p-env-v3')
		const parsed = JSON.parse(raw ?? '')

		expect(parsed).toEqual({ v: 3, data: 'test' })

		s.destroy()
	})

	it('writes raw JSON without envelope for version 1', () => {
		const s = state('p-raw-v1', {
			default: 'initial',
			scope: 'local',
			version: 1,
		})

		s.set('test')

		const raw = localStorage.getItem('p-raw-v1')

		expect(raw).toBe('"test"')

		s.destroy()
	})

	it('migration error falls back to default and does not poison data', () => {
		localStorage.setItem('p-mig-poison', JSON.stringify({ count: 5 }))

		const s = state('p-mig-poison', {
			default: { count: 0 },
			scope: 'local',
			version: 2,
			migrate: {
				1: () => {
					throw new Error('boom')
				},
			},
		})

		expect(s.get()).toEqual({ count: 0 })

		s.set({ count: 42 })

		const raw = localStorage.getItem('p-mig-poison')
		const parsed = JSON.parse(raw ?? '')

		expect(parsed).toEqual({ v: 2, data: { count: 42 } })

		s.destroy()
	})

	it('fires onValidationFail when validate returns false', async () => {
		const { configure, resetConfig } = await import('../src/index.js')
		const { vi, expect } = await import('vitest')

		const spy = vi.fn()

		configure({ onValidationFail: spy })

		localStorage.setItem('p-valfail-cb', '"bad-data"')

		const s = state('p-valfail-cb', {
			default: 0,
			scope: 'local',
			validate: (v): v is number => typeof v === 'number',
		})

		expect(s.get()).toBe(0)
		expect(spy).toHaveBeenCalledWith({ key: 'p-valfail-cb', scope: 'local', value: 'bad-data' })

		s.destroy()
		resetConfig()
	})
})
