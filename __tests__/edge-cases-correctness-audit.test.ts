import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorageAdapter } from '../src/adapters/storage.js'
import { batch } from '../src/batch.js'
import { collection } from '../src/collection.js'
import { computed } from '../src/computed.js'
import { configure, resetConfig } from '../src/config.js'
import { withWatch } from '../src/enhancers/watch.js'
import { select } from '../src/select.js'
import { state } from '../src/shortcuts.js'
import { makeStorage, setupBrowserEnv } from './helpers.js'

// ---------------------------------------------------------------------------
// Finding #1 — Custom serializer migration chain
// ---------------------------------------------------------------------------

describe('Finding #1: custom serializer + migration', () => {
	beforeEach(() => {
		setupBrowserEnv()
	})

	afterEach(() => {
		resetConfig()
	})

	it('runs migrations when custom serializer is used with version + migrate', () => {
		const storage = makeStorage()

		// Simulate old data at version 1 (no version envelope)
		storage.setItem('migrated', JSON.stringify({ name: 'Alice' }))

		const adapter = createStorageAdapter(storage, 'migrated', {
			default: { name: '', age: 0 },
			version: 2,
			migrate: {
				1: (old: unknown) => ({ ...(old as Record<string, unknown>), age: 0 }),
			},
			serialize: { parse: JSON.parse, stringify: JSON.stringify },
		})

		const value = adapter.get()

		expect(value).toEqual({ name: 'Alice', age: 0 })

		adapter.destroy?.()
	})

	it('handles versioned envelope through custom serializer', () => {
		const storage = makeStorage()

		// Data with version envelope (written by new code path)
		storage.setItem('enveloped', JSON.stringify({ v: 1, data: { name: 'Bob' } }))

		const adapter = createStorageAdapter(storage, 'enveloped', {
			default: { name: '', age: 0 },
			version: 2,
			migrate: {
				1: (old: unknown) => ({ ...(old as Record<string, unknown>), age: 25 }),
			},
			serialize: { parse: JSON.parse, stringify: JSON.stringify },
		})

		const value = adapter.get()

		expect(value).toEqual({ name: 'Bob', age: 25 })

		adapter.destroy?.()
	})

	it('writes version envelope when custom serializer is used with version > 1', () => {
		const storage = makeStorage()

		const adapter = createStorageAdapter(storage, 'write-test', {
			default: { name: '' },
			version: 2,
			serialize: { parse: JSON.parse, stringify: JSON.stringify },
		})

		adapter.set({ name: 'Charlie' })

		const raw = storage.getItem('write-test')
		const parsed = JSON.parse(raw as string)

		expect(parsed).toEqual({ v: 2, data: { name: 'Charlie' } })

		adapter.destroy?.()
	})

	it('does not wrap in envelope when version is 1 or unset', () => {
		const storage = makeStorage()

		const adapter = createStorageAdapter(storage, 'no-envelope', {
			default: { name: '' },
			serialize: { parse: JSON.parse, stringify: JSON.stringify },
		})

		adapter.set({ name: 'Dave' })

		const raw = storage.getItem('no-envelope')
		const parsed = JSON.parse(raw as string)

		// No envelope — raw value directly
		expect(parsed).toEqual({ name: 'Dave' })

		adapter.destroy?.()
	})

	it('validates after migration in custom serializer path', () => {
		const storage = makeStorage()

		storage.setItem('validate-after-migrate', JSON.stringify({ name: 'Eve' }))

		const onError = vi.fn()

		configure({ onError })

		const adapter = createStorageAdapter(storage, 'validate-after-migrate', {
			default: { name: '', age: 0 },
			scope: 'local',
			version: 2,
			migrate: {
				1: (old: unknown) => ({ ...(old as Record<string, unknown>), age: -1 }),
			},
			validate: (v): v is { name: string; age: number } => {
				const rec = v as Record<string, unknown>
				return typeof rec.age === 'number' && rec.age >= 0
			},
			serialize: { parse: JSON.parse, stringify: JSON.stringify },
		})

		// Should fall back to default because migrated value fails validation
		const value = adapter.get()

		expect(value).toEqual({ name: '', age: 0 })
		expect(onError).toHaveBeenCalled()

		adapter.destroy?.()
	})

	it('fires onMigrate callback in custom serializer path', () => {
		const storage = makeStorage()

		storage.setItem('on-migrate', JSON.stringify({ name: 'Frank' }))

		const onMigrate = vi.fn()

		configure({ onMigrate })

		const adapter = createStorageAdapter(storage, 'on-migrate', {
			default: { name: '', age: 0 },
			scope: 'local',
			version: 2,
			migrate: {
				1: (old: unknown) => ({ ...(old as Record<string, unknown>), age: 30 }),
			},
			serialize: { parse: JSON.parse, stringify: JSON.stringify },
		})

		adapter.get()

		expect(onMigrate).toHaveBeenCalledWith(
			expect.objectContaining({
				key: 'on-migrate',
				fromVersion: 1,
				toVersion: 2,
			}),
		)

		adapter.destroy?.()
	})
})

// ---------------------------------------------------------------------------
// Finding #2 — Computed/select subscribe-during-notify snapshot
// ---------------------------------------------------------------------------

describe('Finding #2: computed/select notification snapshot', () => {
	it('computed: listener added during notification does not fire in same cycle', () => {
		const source = state('snap-c-src', { default: 0 })

		const derived = computed([source], ([v]) => (v ?? 0) * 2)

		const secondListener = vi.fn()

		const firstListener = vi.fn(() => {
			// Subscribe a new listener during notification
			derived.subscribe(secondListener)
		})

		derived.subscribe(firstListener)

		source.set(5)

		// First listener was called with 10
		expect(firstListener).toHaveBeenCalledWith(10)

		// Second listener should NOT have been called in the same cycle
		expect(secondListener).not.toHaveBeenCalled()

		// But on next change it should fire
		source.set(10)

		expect(secondListener).toHaveBeenCalledWith(20)

		derived.destroy()
		source.destroy()
	})

	it('select: listener added during notification does not fire in same cycle', () => {
		const source = state('snap-s-src', { default: 0 })

		const derived = select(source, (v) => (v ?? 0) * 2)

		const secondListener = vi.fn()

		const firstListener = vi.fn(() => {
			derived.subscribe(secondListener)
		})

		derived.subscribe(firstListener)

		source.set(5)

		expect(firstListener).toHaveBeenCalledWith(10)
		expect(secondListener).not.toHaveBeenCalled()

		source.set(10)

		expect(secondListener).toHaveBeenCalledWith(20)

		derived.destroy()
		source.destroy()
	})

	it('computed: listener removed during notification does not affect other listeners', () => {
		const source = state('snap-c-unsub', { default: 0 })

		const derived = computed([source], ([v]) => (v ?? 0) * 2)

		const thirdListener = vi.fn()

		let unsub2: (() => void) | undefined

		const firstListener = vi.fn()

		const secondListener = vi.fn(() => {
			// Unsubscribe self during notification
			unsub2?.()
		})

		derived.subscribe(firstListener)
		unsub2 = derived.subscribe(secondListener)
		derived.subscribe(thirdListener)

		source.set(5)

		// All three should have been called (snapshot taken before iteration)
		expect(firstListener).toHaveBeenCalledWith(10)
		expect(secondListener).toHaveBeenCalledWith(10)
		expect(thirdListener).toHaveBeenCalledWith(10)

		// On next change, only first and third should fire
		source.set(10)

		expect(firstListener).toHaveBeenCalledTimes(2)
		expect(secondListener).toHaveBeenCalledTimes(1)
		expect(thirdListener).toHaveBeenCalledTimes(2)

		derived.destroy()
		source.destroy()
	})
})

// ---------------------------------------------------------------------------
// Finding #3 — notifyWatchers snapshot
// ---------------------------------------------------------------------------

describe('Finding #3: notifyWatchers snapshot safety', () => {
	it('watcher added during notification does not fire in same cycle (withWatch)', () => {
		const source = state('watch-snap', { default: { x: 0, y: 0 } })

		const watched = withWatch(source)

		const secondWatcher = vi.fn()

		const firstWatcher = vi.fn(() => {
			// Register a new watcher during notification
			watched.watch('y', secondWatcher)
		})

		watched.watch('x', firstWatcher)

		source.set({ x: 1, y: 1 })

		expect(firstWatcher).toHaveBeenCalledWith(1)
		// Second watcher should NOT fire in the same notification cycle
		expect(secondWatcher).not.toHaveBeenCalled()

		// On next change it should fire
		source.set({ x: 1, y: 2 })

		expect(secondWatcher).toHaveBeenCalledWith(2)

		watched.destroy()
	})

	it('watcher added to same key during notification does not fire in same cycle', () => {
		const source = state('watch-same-key', { default: { x: 0 } })

		const watched = withWatch(source)

		const secondWatcher = vi.fn()

		const firstWatcher = vi.fn(() => {
			watched.watch('x', secondWatcher)
		})

		watched.watch('x', firstWatcher)

		source.set({ x: 1 })

		expect(firstWatcher).toHaveBeenCalledWith(1)
		expect(secondWatcher).not.toHaveBeenCalled()

		source.set({ x: 2 })

		expect(secondWatcher).toHaveBeenCalledWith(2)

		watched.destroy()
	})

	it('collection watcher added during notification does not fire in same cycle', () => {
		const col = collection('col-watch-snap', {
			default: [{ id: 1, name: 'a' }],
		})

		const secondWatcher = vi.fn()

		const firstWatcher = vi.fn(() => {
			col.watch('name', secondWatcher)
		})

		col.watch('id', firstWatcher)

		col.update(() => true, { id: 2, name: 'b' })

		expect(firstWatcher).toHaveBeenCalled()
		expect(secondWatcher).not.toHaveBeenCalled()

		col.destroy()
	})
})

// ---------------------------------------------------------------------------
// Finding #4 — Batch flush error routing
// ---------------------------------------------------------------------------

describe('Finding #4: batch flush errors routed through onError', () => {
	afterEach(() => {
		resetConfig()
	})

	it('routes batch notification errors through onError callback', () => {
		const onError = vi.fn()

		configure({ onError })

		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const source = state('batch-err', { default: 0 })

		// Subscribe a listener that throws
		source.subscribe(() => {
			throw new Error('listener boom')
		})

		// The error should be caught by safeCall which already uses reportError.
		// This test verifies that the error reaches onError.
		batch(() => {
			source.set(1)
		})

		expect(onError).toHaveBeenCalled()

		errorSpy.mockRestore()
		source.destroy()
	})
})

// ---------------------------------------------------------------------------
// Finding #6 — select NOOP consistency
// ---------------------------------------------------------------------------

describe('Finding #6: select destroyed subscribe returns shared NOOP', () => {
	it('returns the same function reference for multiple destroyed subscribes', () => {
		const source = state('noop-src', { default: 0 })

		const derived = select(source, (v) => v)

		derived.destroy()

		const unsub1 = derived.subscribe(() => {})
		const unsub2 = derived.subscribe(() => {})

		// Both should return the same NOOP function reference
		expect(unsub1).toBe(unsub2)

		source.destroy()
	})
})
