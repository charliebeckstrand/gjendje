import { beforeEach, describe, expect, it } from 'vitest'
import { state } from '../src/index.js'
import { setupBrowserEnv } from './helpers.js'

beforeEach(() => {
	setupBrowserEnv()
})

// ---------------------------------------------------------------------------
// Feature 4 — Instance registry
// ---------------------------------------------------------------------------

describe('instance registry', () => {
	it('returns the same instance for the same key and scope', () => {
		const a = state('reg-theme', { default: 'light', scope: 'memory' })
		const b = state('reg-theme', { default: 'light', scope: 'memory' })

		expect(a).toBe(b)

		a.destroy()
	})

	it('returns different instances for different scopes', () => {
		const a = state('reg-x', { default: 0, scope: 'memory' })
		const b = state('reg-x', { default: 0, scope: 'local' })

		expect(a).not.toBe(b)

		a.destroy()
		b.destroy()
	})

	it('returns different instances for different keys', () => {
		const a = state('reg-a', { default: 0 })
		const b = state('reg-b', { default: 0 })

		expect(a).not.toBe(b)

		a.destroy()
		b.destroy()
	})

	it('returns a fresh instance after the previous one is destroyed', () => {
		const a = state('reg-fresh', { default: 0 })

		a.destroy()

		const b = state('reg-fresh', { default: 0 })

		expect(a).not.toBe(b)
		expect(b.isDestroyed).toBe(false)

		b.destroy()
	})

	it('shared instance sees updates from any reference', () => {
		const a = state('reg-shared', { default: 0 })
		const b = state('reg-shared', { default: 0 })

		a.set(99)

		expect(b.get()).toBe(99)

		a.destroy()
	})
})
