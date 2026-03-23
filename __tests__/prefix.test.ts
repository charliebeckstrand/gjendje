import { beforeEach, describe, expect, it } from 'vitest'
import { configure, state } from '../src/index.js'
import { makeStorage } from './helpers.js'

beforeEach(() => {
	configure({ prefix: undefined })

	Object.defineProperty(globalThis, 'localStorage', {
		value: makeStorage(),
		configurable: true,
	})

	Object.defineProperty(globalThis, 'sessionStorage', {
		value: makeStorage(),
		configurable: true,
	})

	Object.defineProperty(globalThis, 'window', {
		value: { addEventListener: () => {}, removeEventListener: () => {} },
		configurable: true,
		writable: true,
	})
})

// ---------------------------------------------------------------------------
// global prefix
// ---------------------------------------------------------------------------

describe('global prefix', () => {
	it('prepends global prefix to localStorage key', () => {
		configure({ prefix: 'myapp' })

		const theme = state('pfx-global', { default: 'light', scope: 'local' })

		theme.set('dark')

		expect(localStorage.getItem('myapp:pfx-global')).toBe('"dark"')

		theme.destroy()
	})

	it('prepends global prefix to sessionStorage key', () => {
		configure({ prefix: 'myapp' })

		const step = state('pfx-session', { default: 1, scope: 'session' })

		step.set(2)

		expect(sessionStorage.getItem('myapp:pfx-session')).toBe('2')

		step.destroy()
	})

	it('reads prefixed value from storage on init', () => {
		configure({ prefix: 'myapp' })

		localStorage.setItem('myapp:pfx-read', '"dark"')

		const theme = state('pfx-read', { default: 'light', scope: 'local' })

		expect(theme.get()).toBe('dark')

		theme.destroy()
	})

	it('does not prefix memory scope', () => {
		configure({ prefix: 'myapp' })

		const x = state('pfx-memory', { default: 0, scope: 'memory' })

		x.set(42)

		expect(x.get()).toBe(42)

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// per-instance prefix override
// ---------------------------------------------------------------------------

describe('per-instance prefix', () => {
	it('overrides global prefix with a custom string', () => {
		configure({ prefix: 'global' })

		const theme = state('pfx-override', { default: 'light', scope: 'local', prefix: 'custom' })

		theme.set('dark')

		expect(localStorage.getItem('custom:pfx-override')).toBe('"dark"')
		expect(localStorage.getItem('global:pfx-override')).toBeNull()

		theme.destroy()
	})

	it('disables prefix with false', () => {
		configure({ prefix: 'myapp' })

		const theme = state('pfx-disabled', { default: 'light', scope: 'local', prefix: false })

		theme.set('dark')

		expect(localStorage.getItem('pfx-disabled')).toBe('"dark"')
		expect(localStorage.getItem('myapp:pfx-disabled')).toBeNull()

		theme.destroy()
	})
})

// ---------------------------------------------------------------------------
// no prefix configured
// ---------------------------------------------------------------------------

describe('no prefix', () => {
	it('uses raw key when no prefix is configured', () => {
		const theme = state('pfx-none', { default: 'light', scope: 'local' })

		theme.set('dark')

		expect(localStorage.getItem('pfx-none')).toBe('"dark"')

		theme.destroy()
	})
})

// ---------------------------------------------------------------------------
// instance identity with prefix
// ---------------------------------------------------------------------------

describe('instance identity with prefix', () => {
	it('same key + scope returns same instance regardless of prefix', () => {
		configure({ prefix: 'myapp' })

		const a = state('pfx-identity', { default: 'light', scope: 'local' })
		const b = state('pfx-identity', { default: 'light', scope: 'local' })

		expect(a).toBe(b)

		a.destroy()
	})
})
