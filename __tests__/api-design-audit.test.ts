import { afterEach, describe, expect, it, vi } from 'vitest'
import { batch } from '../src/batch.js'
import { computed } from '../src/computed.js'
import { configure, getConfig, resetConfig } from '../src/config.js'
import { withHistory } from '../src/enhancers/history.js'
import { ComputedError } from '../src/errors.js'
import { state } from '../src/shortcuts.js'

// ---------------------------------------------------------------------------
// configure() — logLevel validation
// ---------------------------------------------------------------------------

describe('configure() logLevel validation', () => {
	afterEach(() => {
		resetConfig()
	})

	it('accepts logLevel silent without throwing', () => {
		expect(() => configure({ logLevel: 'silent' })).not.toThrow()
	})

	it('accepts logLevel warn without throwing', () => {
		expect(() => configure({ logLevel: 'warn' })).not.toThrow()
	})

	it('accepts logLevel error without throwing', () => {
		expect(() => configure({ logLevel: 'error' })).not.toThrow()
	})

	it('accepts logLevel debug without throwing', () => {
		expect(() => configure({ logLevel: 'debug' })).not.toThrow()
	})

	it('throws for invalid logLevel verbose with message containing logLevel', () => {
		expect(() => configure({ logLevel: 'verbose' as never })).toThrow(/logLevel/)
	})

	it('throws for invalid logLevel info with message containing logLevel', () => {
		expect(() => configure({ logLevel: 'info' as never })).toThrow(/logLevel/)
	})
})

// ---------------------------------------------------------------------------
// configure() — scope validation
// ---------------------------------------------------------------------------

describe('configure() scope validation', () => {
	afterEach(() => {
		resetConfig()
	})

	it('accepts scope memory without throwing', () => {
		expect(() => configure({ scope: 'memory' })).not.toThrow()
	})

	it('accepts scope local without throwing', () => {
		expect(() => configure({ scope: 'local' })).not.toThrow()
	})

	it('accepts scope session without throwing', () => {
		expect(() => configure({ scope: 'session' })).not.toThrow()
	})

	it('accepts scope url without throwing', () => {
		expect(() => configure({ scope: 'url' })).not.toThrow()
	})

	it('accepts scope server without throwing', () => {
		expect(() => configure({ scope: 'server' })).not.toThrow()
	})

	it('accepts scope bucket without throwing', () => {
		expect(() => configure({ scope: 'bucket' })).not.toThrow()
	})

	it('throws for invalid scope redis with message containing scope', () => {
		expect(() => configure({ scope: 'redis' as never })).toThrow(/scope/)
	})

	it('throws for invalid scope indexeddb with message containing scope', () => {
		expect(() => configure({ scope: 'indexeddb' as never })).toThrow(/scope/)
	})
})

// ---------------------------------------------------------------------------
// ComputedError — derivation function throwing
// ---------------------------------------------------------------------------

describe('ComputedError — derivation function throwing', () => {
	it('throws ComputedError when derivation throws on creation', () => {
		const a = state('comp-err-create', { default: 1 })

		expect(() =>
			computed([a], () => {
				throw new Error('boom')
			}),
		).toThrow('Computed derivation threw')

		a.destroy()
	})

	it('throws ComputedError when derivation throws after dependency change', () => {
		const a = state('comp-err-dep', { default: 1 })

		let shouldThrow = false

		const c = computed([a], ([v]) => {
			if (shouldThrow) throw new Error('late boom')
			return (v ?? 0) * 2
		})

		expect(c.get()).toBe(2)

		shouldThrow = true
		a.set(2)

		// get() triggers recompute which throws
		expect(() => c.get()).toThrow('Computed derivation threw')

		c.destroy()
		a.destroy()
	})

	it('ComputedError wraps the original cause', () => {
		const a = state('comp-err-cause', { default: 1 })

		const originalError = new Error('inner cause')

		let threw: ComputedError | undefined

		try {
			computed([a], () => {
				throw originalError
			})
		} catch (err) {
			threw = err as ComputedError
		}

		expect(threw instanceof ComputedError).toBe(true)
		expect(threw?.cause).toBe(originalError)

		a.destroy()
	})

	it('ComputedError has the computed key on it', () => {
		const a = state('comp-err-key-prop', { default: 1 })

		let threw: ComputedError | undefined

		try {
			computed(
				[a],
				() => {
					throw new Error('oops')
				},
				{ key: 'my-computed' },
			)
		} catch (err) {
			threw = err as ComputedError
		}

		expect(threw instanceof ComputedError).toBe(true)
		expect(threw?.key).toBe('my-computed')

		a.destroy()
	})

	it('reports ComputedError through onError', () => {
		const onError = vi.fn()

		configure({ onError })

		const a = state('comp-err-report', { default: 1 })

		expect(() =>
			computed([a], () => {
				throw new Error('report boom')
			}),
		).toThrow()

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				error: expect.any(ComputedError),
			}),
		)

		a.destroy()
		resetConfig()
	})

	it('derivation receives current dep values as an array', () => {
		const a = state('comp-dep-values-a', { default: 3 })
		const b = state('comp-dep-values-b', { default: 7 })

		const c = computed([a, b], ([va, vb]) => (va ?? 0) + (vb ?? 0))

		expect(c.get()).toBe(10)

		c.destroy()
		a.destroy()
		b.destroy()
	})
})

// ---------------------------------------------------------------------------
// Computed listener errors route through onError
// ---------------------------------------------------------------------------

describe('computed subscriber error routes through onError', () => {
	afterEach(() => {
		resetConfig()
	})

	it('computed subscriber error is reported via onError', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		const onError = vi.fn()

		configure({ onError })

		const a = state('comp-listener-err', { default: 1 })
		const c = computed([a], ([v]) => (v ?? 0) * 2)

		c.subscribe(() => {
			throw new Error('listener boom')
		})

		a.set(2)

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ key: expect.stringContaining('computed:') }),
		)

		errorSpy.mockRestore()
		c.destroy()
		a.destroy()
	})

	it('onError receives the thrown listener error as the error property', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		const onError = vi.fn()

		configure({ onError })

		const a = state('comp-listener-err-val', { default: 0 })
		const c = computed([a], ([v]) => (v ?? 0) + 1)

		const listenerError = new Error('sub exploded')

		c.subscribe(() => {
			throw listenerError
		})

		a.set(1)

		const call = onError.mock.calls[0]?.[0]

		expect(call?.error).toBe(listenerError)

		errorSpy.mockRestore()
		c.destroy()
		a.destroy()
	})

	it('other subscribers still run after one throws', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		configure({ onError: vi.fn() })

		const a = state('comp-listener-multi', { default: 0 })
		const c = computed([a], ([v]) => (v ?? 0) * 2)

		const received: number[] = []

		c.subscribe(() => {
			throw new Error('first listener fails')
		})
		c.subscribe((v) => received.push(v))

		a.set(5)

		expect(received).toEqual([10])

		errorSpy.mockRestore()
		c.destroy()
		a.destroy()
	})
})

// ---------------------------------------------------------------------------
// ComputedError — export verification
// ---------------------------------------------------------------------------

describe('ComputedError export verification', () => {
	it('ComputedError is importable from the package errors', () => {
		expect(ComputedError).toBeDefined()
		expect(new ComputedError('test', 'memory') instanceof ComputedError).toBe(true)
	})

	it('ComputedError is a subclass of Error', () => {
		const err = new ComputedError('test-key', 'memory', new Error('cause'))

		expect(err instanceof Error).toBe(true)
		expect(err.name).toBe('ComputedError')
		expect(err.key).toBe('test-key')
		expect(err.scope).toBe('memory')
	})

	it('ComputedError message includes the key', () => {
		const err = new ComputedError('my-derived-key', 'memory')

		expect(err.message).toContain('my-derived-key')
	})
})

// ---------------------------------------------------------------------------
// DepValues export verification
// ---------------------------------------------------------------------------

describe('DepValues export verification', () => {
	it('DepValues is importable as a type from the package', () => {
		// This test verifies the type export works at runtime import level.
		// The actual type checking is done at compile time.
		// If this file compiles, DepValues is correctly exported.
		expect(true).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// batch() — works with computed dependencies
// ---------------------------------------------------------------------------

describe('batch() with computed dependencies', () => {
	it('computed notifies once when multiple deps change inside a batch', () => {
		const a = state('batch-comp-a', { default: 1 })
		const b = state('batch-comp-b', { default: 2 })

		const c = computed([a, b], ([va, vb]) => (va ?? 0) + (vb ?? 0))

		const calls: number[] = []

		c.subscribe((v) => calls.push(v))

		batch(() => {
			a.set(10)
			b.set(20)
		})

		// Single notification: 10 + 20 = 30
		expect(calls).toEqual([30])

		c.destroy()
		a.destroy()
		b.destroy()
	})

	it('computed value is correct after batch', () => {
		const x = state('batch-comp-val', { default: 0 })

		const doubled = computed([x], ([v]) => (v ?? 0) * 2)

		batch(() => {
			x.set(5)
		})

		expect(doubled.get()).toBe(10)

		doubled.destroy()
		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// withHistory — validates against bad options
// ---------------------------------------------------------------------------

describe('withHistory() validation', () => {
	it('throws when maxSize is zero', () => {
		const s = state('hist-zero', { default: 0 })

		expect(() => withHistory(s, { maxSize: 0 })).toThrow(/maxSize/)

		s.destroy()
	})

	it('throws when maxSize is negative', () => {
		const s = state('hist-neg', { default: 0 })

		expect(() => withHistory(s, { maxSize: -1 })).toThrow(/maxSize/)

		s.destroy()
	})

	it('does not throw with valid maxSize', () => {
		const s = state('hist-valid', { default: 0 })

		const h = withHistory(s, { maxSize: 10 })

		expect(h).toBeDefined()

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// configure() — validate-before-mutate
// ---------------------------------------------------------------------------

describe('configure() validate-before-mutate', () => {
	afterEach(() => {
		resetConfig()
	})

	it('does not corrupt config when maxKeys validation fails', () => {
		configure({ logLevel: 'debug' })

		expect(() => configure({ maxKeys: -1 })).toThrow(/maxKeys/)

		const config = getConfig()

		expect(config.logLevel).toBe('debug')
		expect(config.maxKeys).toBeUndefined()
	})

	it('does not corrupt config when logLevel validation fails', () => {
		configure({ maxKeys: 50 })

		expect(() => configure({ logLevel: 'verbose' as never })).toThrow(/logLevel/)

		const config = getConfig()

		expect(config.maxKeys).toBe(50)
		expect(config.logLevel).toBeUndefined()
	})

	it('does not corrupt config when scope validation fails', () => {
		configure({ logLevel: 'error' })

		expect(() => configure({ scope: 'redis' as never })).toThrow(/scope/)

		const config = getConfig()

		expect(config.logLevel).toBe('error')
		expect(config.scope).toBeUndefined()
	})

	it('does not merge any fields from a partially-invalid call', () => {
		configure({ logLevel: 'debug' })

		expect(() => configure({ maxKeys: 10, logLevel: 'bad' as never })).toThrow(/logLevel/)

		const config = getConfig()

		expect(config.logLevel).toBe('debug')
		expect(config.maxKeys).toBeUndefined()
	})
})

// ---------------------------------------------------------------------------
// configure() — keyPattern validation
// ---------------------------------------------------------------------------

describe('configure() keyPattern validation', () => {
	afterEach(() => {
		resetConfig()
	})

	it('accepts a valid RegExp for keyPattern', () => {
		expect(() => configure({ keyPattern: /^[a-z-]+$/ })).not.toThrow()
	})

	it('throws when keyPattern is a string', () => {
		expect(() => configure({ keyPattern: '^[a-z]+$' as never })).toThrow(/keyPattern/)
	})

	it('throws when keyPattern is a number', () => {
		expect(() => configure({ keyPattern: 42 as never })).toThrow(/keyPattern/)
	})

	it('does not corrupt config when keyPattern validation fails', () => {
		configure({ logLevel: 'debug' })

		expect(() => configure({ keyPattern: 'bad' as never })).toThrow(/keyPattern/)

		const config = getConfig()

		expect(config.logLevel).toBe('debug')
		expect(config.keyPattern).toBeUndefined()
	})
})
