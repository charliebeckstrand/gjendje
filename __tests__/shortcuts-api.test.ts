import { beforeEach, describe, expect, it } from 'vitest'
import { bucket, local, session, state, url } from '../src/index.js'
import { makeStorage } from './helpers.js'

const fallbackStorage = makeStorage()

beforeEach(() => {
	fallbackStorage.clear()

	Object.defineProperty(globalThis, 'localStorage', {
		value: fallbackStorage,
		configurable: true,
	})

	Object.defineProperty(globalThis, 'navigator', {
		value: {},
		configurable: true,
		writable: true,
	})
})

describe('scope shortcut functions', () => {
	describe('local()', () => {
		it('creates state with local scope', () => {
			const s = local({ theme: 'light' })

			expect(s.get()).toBe('light')
			expect(s.scope).toBe('local')
			expect(s.key).toBe('theme')

			s.destroy()
		})

		it('passes through extra options', () => {
			const s = local({ count: 0 }, { isEqual: (a, b) => a === b })

			expect(s.get()).toBe(0)
			expect(s.scope).toBe('local')

			s.destroy()
		})

		it('works with object default values', () => {
			const s = local({ prefs: { dark: true, lang: 'en' } })

			expect(s.get()).toEqual({ dark: true, lang: 'en' })

			s.destroy()
		})
	})

	describe('session()', () => {
		it('creates state with tab scope', () => {
			const s = session({ draft: '' })

			expect(s.get()).toBe('')
			expect(s.scope).toBe('tab')
			expect(s.key).toBe('draft')

			s.destroy()
		})
	})

	describe('url()', () => {
		it('creates state with url scope', () => {
			const s = url({ q: '' })

			expect(s.get()).toBe('')
			expect(s.scope).toBe('url')
			expect(s.key).toBe('q')

			s.destroy()
		})
	})

	describe('bucket()', () => {
		it('creates state with bucket scope', () => {
			const s = bucket({ cache: 'empty' }, { bucket: { name: 'test-bucket' } })

			expect(s.get()).toBe('empty')
			expect(s.scope).toBe('bucket')
			expect(s.key).toBe('cache')

			s.destroy()
		})

		it('falls back to localStorage when Storage Buckets unavailable', async () => {
			const s = bucket({ theme: 'light' }, { bucket: { name: 'test-bucket', fallback: 'local' } })

			await s.ready

			s.set('dark')

			expect(fallbackStorage.getItem('theme')).toBe('"dark"')

			s.destroy()
		})

		it('passes through extra options', async () => {
			const s = bucket(
				{ prefs: { lang: 'en' } },
				{ bucket: { name: 'test-bucket' }, isEqual: (a, b) => a.lang === b.lang },
			)

			expect(s.get()).toEqual({ lang: 'en' })

			s.destroy()
		})
	})

	describe('validation', () => {
		it('throws when entry has zero keys', () => {
			expect(() => local({})).toThrow('exactly one key')
		})

		it('throws when entry has multiple keys', () => {
			expect(() => local({ a: 1, b: 2 })).toThrow('exactly one key')
		})
	})
})

describe('memory scope alias', () => {
	it('accepts memory as a scope', () => {
		const s = state('mem-test', 0, { scope: 'memory' })

		expect(s.get()).toBe(0)

		s.set(5)

		expect(s.get()).toBe(5)

		s.destroy()
	})

	it('memory and render share the same registry entry', () => {
		const a = state('mem-shared', 10, { scope: 'render' })
		const b = state('mem-shared', 10, { scope: 'memory' })

		// Both should resolve to the same underlying render scope
		// Since 'memory' normalizes to 'render', they share a registry key
		expect(a).toBe(b)

		a.destroy()
	})
})
