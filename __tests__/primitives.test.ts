import { beforeEach, describe, expect, it, vi } from 'vitest'
import { batch, collection, computed, effect, state } from '../src/index.js'
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
// computed
// ---------------------------------------------------------------------------

describe('computed', () => {
	it('derives a value from a single dependency', () => {
		const count = state('cmp-single', { default: 2 })

		const doubled = computed([count], ([n]) => (n as number) * 2)

		expect(doubled.get()).toBe(4)

		count.destroy()
		doubled.destroy()
	})

	it('derives a value from multiple dependencies', () => {
		const first = state('cmp-first', { default: 'Jane' })
		const last = state('cmp-last', { default: 'Doe' })

		const fullName = computed([first, last], ([f, l]) => `${f as string} ${l as string}`)

		expect(fullName.get()).toBe('Jane Doe')

		first.destroy()
		last.destroy()
		fullName.destroy()
	})

	it('updates when a dependency changes', () => {
		const count = state('cmp-update', { default: 1 })

		const doubled = computed([count], ([n]) => (n as number) * 2)

		count.set(5)

		expect(doubled.get()).toBe(10)

		count.destroy()
		doubled.destroy()
	})

	it('notifies subscribers when recomputed', () => {
		const count = state('cmp-notify', { default: 0 })

		const doubled = computed([count], ([n]) => (n as number) * 2)

		const listener = vi.fn()

		doubled.subscribe(listener)
		count.set(3)

		expect(listener).toHaveBeenCalledWith(6)
		expect(listener).toHaveBeenCalledTimes(1)

		count.destroy()
		doubled.destroy()
	})

	it('only recomputes when a dependency actually changes', () => {
		const count = state('cmp-cache', { default: 1 })

		const fn = vi.fn((values: number[]) => (values[0] as number) * 2)

		const doubled = computed([count], fn)

		doubled.get()
		doubled.get()
		doubled.get()

		// fn called once on init, not on repeat gets
		expect(fn).toHaveBeenCalledTimes(1)

		count.set(2)
		doubled.get()

		// called again only after dependency changed
		expect(fn).toHaveBeenCalledTimes(2)

		count.destroy()
		doubled.destroy()
	})

	it('peek() returns current value', () => {
		const count = state('cmp-peek', { default: 3 })

		const doubled = computed([count], ([n]) => (n as number) * 2)

		expect(doubled.peek()).toBe(6)

		count.destroy()
		doubled.destroy()
	})

	it('stops listening after destroy', () => {
		const count = state('cmp-destroy', { default: 0 })

		const doubled = computed([count], ([n]) => (n as number) * 2)

		const listener = vi.fn()

		doubled.subscribe(listener)
		doubled.destroy()
		count.set(5)

		expect(listener).not.toHaveBeenCalled()

		count.destroy()
	})

	it('unsubscribes cleanly', () => {
		const count = state('cmp-unsub', { default: 0 })

		const doubled = computed([count], ([n]) => (n as number) * 2)

		const listener = vi.fn()

		const unsub = doubled.subscribe(listener)

		count.set(1)
		unsub()
		count.set(2)

		expect(listener).toHaveBeenCalledTimes(1)

		count.destroy()
		doubled.destroy()
	})
})

// ---------------------------------------------------------------------------
// effect
// ---------------------------------------------------------------------------

describe('effect', () => {
	it('runs immediately with current values', () => {
		const count = state('eff-immediate', { default: 42 })

		const fn = vi.fn()

		const handle = effect([count], fn)

		expect(fn).toHaveBeenCalledWith([42])
		expect(fn).toHaveBeenCalledTimes(1)

		handle.stop()
		count.destroy()
	})

	it('re-runs when a dependency changes', () => {
		const count = state('eff-rerun', { default: 0 })

		const fn = vi.fn()

		const handle = effect([count], fn)

		count.set(1)
		count.set(2)

		expect(fn).toHaveBeenCalledTimes(3) // initial + 2 changes

		handle.stop()
		count.destroy()
	})

	it('runs cleanup before next execution', () => {
		const count = state('eff-cleanup', { default: 0 })

		const calls: string[] = []

		const handle = effect([count], () => {
			calls.push('run')
			return () => calls.push('cleanup')
		})

		count.set(1)

		expect(calls).toEqual(['run', 'cleanup', 'run'])

		handle.stop()
		count.destroy()
	})

	it('runs cleanup when stopped', () => {
		const count = state('eff-stop-cleanup', { default: 0 })

		const cleanup = vi.fn()

		const handle = effect([count], () => cleanup)

		handle.stop()

		expect(cleanup).toHaveBeenCalledTimes(1)

		count.destroy()
	})

	it('does not re-run after stop', () => {
		const count = state('eff-no-rerun', { default: 0 })

		const fn = vi.fn()

		const handle = effect([count], fn)

		handle.stop()
		count.set(1)

		// Only the initial run
		expect(fn).toHaveBeenCalledTimes(1)

		count.destroy()
	})

	it('works with multiple dependencies', () => {
		const a = state('eff-multi-a', { default: 1 })
		const b = state('eff-multi-b', { default: 2 })

		const fn = vi.fn()

		const handle = effect([a, b], fn)

		a.set(10)
		b.set(20)

		expect(fn).toHaveBeenCalledTimes(3)
		expect(fn).toHaveBeenLastCalledWith([10, 20])

		handle.stop()
		a.destroy()
		b.destroy()
	})

	it('calling stop twice does not throw', () => {
		const count = state('eff-stop-twice', { default: 0 })

		const handle = effect([count], () => undefined)

		handle.stop()

		expect(() => handle.stop()).not.toThrow()

		count.destroy()
	})
})

// ---------------------------------------------------------------------------
// collection
// ---------------------------------------------------------------------------

interface Todo {
	id: string
	text: string
	done: boolean
}

describe('collection', () => {
	it('returns the default empty array', () => {
		const todos = collection('col-default', { default: [] as Todo[] })

		expect(todos.get()).toEqual([])
		expect(todos.size).toBe(0)

		todos.destroy()
	})

	it('add() appends items', () => {
		const todos = collection('col-add', { default: [] as Todo[] })

		todos.add({ id: '1', text: 'hello', done: false })

		expect(todos.get()).toHaveLength(1)
		expect(todos.size).toBe(1)

		todos.destroy()
	})

	it('add() appends multiple items at once', () => {
		const todos = collection('col-add-multi', { default: [] as Todo[] })

		todos.add({ id: '1', text: 'one', done: false }, { id: '2', text: 'two', done: false })

		expect(todos.size).toBe(2)

		todos.destroy()
	})

	it('remove() removes matching items', () => {
		const todos = collection('col-remove', { default: [] as Todo[] })

		todos.add({ id: '1', text: 'keep', done: false }, { id: '2', text: 'remove', done: true })

		todos.remove((t) => t.done)

		expect(todos.get()).toHaveLength(1)
		expect(todos.get()[0]?.id).toBe('1')

		todos.destroy()
	})

	it('remove() with { one: true } removes only first match', () => {
		const todos = collection('col-remove-one', { default: [] as Todo[] })

		todos.add({ id: '1', text: 'a', done: true }, { id: '2', text: 'b', done: true })

		todos.remove((t) => t.done, { one: true })

		expect(todos.size).toBe(1)
		expect(todos.get()[0]?.id).toBe('2')

		todos.destroy()
	})

	it('update() patches matching items', () => {
		const todos = collection('col-update', { default: [] as Todo[] })

		todos.add({ id: '1', text: 'hello', done: false })
		todos.update((t) => t.id === '1', { done: true })

		expect(todos.get()[0]?.done).toBe(true)
		expect(todos.get()[0]?.text).toBe('hello')

		todos.destroy()
	})

	it('update() with updater function', () => {
		const todos = collection('col-update-fn', { default: [] as Todo[] })

		todos.add({ id: '1', text: 'hello', done: false })
		todos.update(
			(t) => t.id === '1',
			(t) => ({ ...t, text: t.text.toUpperCase() }),
		)

		expect(todos.get()[0]?.text).toBe('HELLO')

		todos.destroy()
	})

	it('update() with { one: true } updates only first match', () => {
		const todos = collection('col-update-one', { default: [] as Todo[] })

		todos.add({ id: '1', text: 'a', done: false }, { id: '2', text: 'b', done: false })

		todos.update((t) => !t.done, { done: true }, { one: true })

		expect(todos.get()[0]?.done).toBe(true)
		expect(todos.get()[1]?.done).toBe(false)

		todos.destroy()
	})

	it('find() returns the first matching item', () => {
		const todos = collection('col-find', { default: [] as Todo[] })

		todos.add({ id: '1', text: 'a', done: false }, { id: '2', text: 'b', done: true })

		const found = todos.find((t) => t.done)

		expect(found?.id).toBe('2')

		todos.destroy()
	})

	it('find() returns undefined when no match', () => {
		const todos = collection('col-find-none', { default: [] as Todo[] })

		todos.add({ id: '1', text: 'a', done: false })

		expect(todos.find((t) => t.done)).toBeUndefined()

		todos.destroy()
	})

	it('findAll() returns all matching items', () => {
		const todos = collection('col-findall', { default: [] as Todo[] })

		todos.add(
			{ id: '1', text: 'a', done: true },
			{ id: '2', text: 'b', done: false },
			{ id: '3', text: 'c', done: true },
		)

		const done = todos.findAll((t) => t.done)

		expect(done).toHaveLength(2)

		todos.destroy()
	})

	it('has() returns true when a match exists', () => {
		const todos = collection('col-has', { default: [] as Todo[] })

		todos.add({ id: '1', text: 'a', done: true })

		expect(todos.has((t) => t.done)).toBe(true)
		expect(todos.has((t) => t.id === 'missing')).toBe(false)

		todos.destroy()
	})

	it('clear() removes all items', () => {
		const todos = collection('col-clear', { default: [] as Todo[] })

		todos.add({ id: '1', text: 'a', done: false }, { id: '2', text: 'b', done: false })

		todos.clear()

		expect(todos.size).toBe(0)

		todos.destroy()
	})

	it('notifies subscribers on mutation', () => {
		const todos = collection('col-notify', { default: [] as Todo[] })

		const listener = vi.fn()

		todos.subscribe(listener)
		todos.add({ id: '1', text: 'hello', done: false })

		expect(listener).toHaveBeenCalledTimes(1)

		todos.destroy()
	})

	it('peek() returns current items', () => {
		const todos = collection('col-peek', { default: [] as Todo[] })

		todos.add({ id: '1', text: 'hello', done: false })

		expect(todos.peek()).toHaveLength(1)

		todos.destroy()
	})

	it('persists to local scope', () => {
		const todos = collection('col-persist', {
			default: [] as Todo[],
			scope: 'local',
		})

		todos.add({ id: '1', text: 'persisted', done: false })

		todos.destroy()

		const restored = collection('col-persist', {
			default: [] as Todo[],
			scope: 'local',
		})

		expect(restored.size).toBe(1)
		expect(restored.get()[0]?.text).toBe('persisted')

		restored.destroy()
	})
})

// ---------------------------------------------------------------------------
// edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
	it('supports null as a default value', () => {
		const x = state('edge-null', { default: null as string | null })

		expect(x.get()).toBeNull()

		x.set('hello')

		expect(x.get()).toBe('hello')

		x.set(null)

		expect(x.get()).toBeNull()

		x.destroy()
	})

	it('supports empty string as a value', () => {
		const x = state('edge-empty', { default: 'initial' })

		x.set('')

		expect(x.get()).toBe('')

		x.destroy()
	})

	it('throws on empty string key', () => {
		expect(() => state('', { default: 0 })).toThrow('[gjendje] key must be a non-empty string.')
	})

	it('supports zero and false as valid values', () => {
		const num = state('edge-zero', { default: 1 })

		num.set(0)

		expect(num.get()).toBe(0)

		num.destroy()

		const bool = state('edge-false', { default: true })

		bool.set(false)

		expect(bool.get()).toBe(false)

		bool.destroy()
	})

	it('computed handles errors from compute function gracefully', () => {
		const count = state('edge-cmp-throw', { default: 0 })

		const risky = computed([count], ([n]) => {
			if ((n as number) > 0) throw new Error('boom')

			return (n as number) * 2
		})

		expect(risky.get()).toBe(0)

		// Setting count to 1 will cause the compute function to throw.
		// Listener errors are caught so one faulty subscriber doesn't break others.
		count.set(1)

		// The computed throws when accessed directly (wrapped in ComputedError)
		expect(() => risky.get()).toThrow('Computed derivation threw')

		count.destroy()
		risky.destroy()
	})

	it('effect cleanup throwing does not prevent stop', () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const x = state('edge-eff-cleanup-throw', { default: 0 })

		const handle = effect([x], () => {
			return () => {
				throw new Error('cleanup boom')
			}
		})

		// stop() calls cleanup which throws, but the error is caught and logged
		handle.stop()
		expect(consoleSpy).toHaveBeenCalled()
		consoleSpy.mockRestore()
		// After stop, no further re-runs
		const fn = vi.fn()

		const handle2 = effect([x], fn)

		x.set(1)

		expect(fn).toHaveBeenCalledTimes(2)

		handle2.stop()
		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// computed + batch
// ---------------------------------------------------------------------------

describe('computed + batch', () => {
	it('defers computed notifications inside batch', () => {
		const count = state('cmp-batch-count', { default: 0 })

		const doubled = computed([count], ([n]) => (n as number) * 2)

		const calls: number[] = []

		doubled.subscribe((v) => calls.push(v))

		batch(() => {
			count.set(1)
			count.set(2)
			count.set(3)
			expect(calls).toHaveLength(0)
		})

		expect(calls).toEqual([6])

		count.destroy()
		doubled.destroy()
	})

	it('flushes computed notifications after batch', () => {
		const a = state('cmp-batch-a', { default: 0 })
		const b = state('cmp-batch-b', { default: 0 })

		const sum = computed([a, b], ([av, bv]) => (av as number) + (bv as number))

		const listener = vi.fn()

		sum.subscribe(listener)

		batch(() => {
			a.set(1)
			b.set(2)
		})

		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith(3)

		a.destroy()
		b.destroy()
		sum.destroy()
	})
})

// ---------------------------------------------------------------------------
// withWatch cleanup
// ---------------------------------------------------------------------------

describe('withWatch cleanup on destroy', () => {
	it('stops firing watch listeners after destroy', () => {
		const prefs = state('watch-cleanup', {
			default: { theme: 'light' as string },
		})

		const listener = vi.fn()

		prefs.watch('theme', listener)
		prefs.destroy()

		// Get a new instance — previous watchers should be gone
		const prefs2 = state('watch-cleanup', {
			default: { theme: 'light' as string },
		})

		prefs2.set({ theme: 'dark' })

		expect(listener).not.toHaveBeenCalled()

		prefs2.destroy()
	})
})

// ---------------------------------------------------------------------------
// collection.watch
// ---------------------------------------------------------------------------

describe('collection.watch', () => {
	it('fires when a watched key changes on any item', () => {
		const todos = collection('col-watch-basic', { default: [] as Todo[] })

		const listener = vi.fn()

		todos.add({ id: '1', text: 'hello', done: false })
		todos.watch('done', listener)
		todos.update((t) => t.id === '1', { done: true })

		expect(listener).toHaveBeenCalledTimes(1)

		todos.destroy()
	})

	it('does not fire when an unwatched key changes', () => {
		const todos = collection('col-watch-unrelated', { default: [] as Todo[] })

		const listener = vi.fn()

		todos.add({ id: '1', text: 'hello', done: false })
		todos.watch('done', listener)

		// Changing text only — done didn't change
		todos.update((t) => t.id === '1', { text: 'world' })

		expect(listener).not.toHaveBeenCalled()

		todos.destroy()
	})

	it('receives the full updated array', () => {
		const todos = collection('col-watch-array', { default: [] as Todo[] })

		const received: Todo[][] = []

		todos.add({ id: '1', text: 'hello', done: false })
		todos.watch('done', (items) => received.push(items))
		todos.update((t) => t.id === '1', { done: true })

		expect(received).toHaveLength(1)
		expect(received[0]?.[0]?.done).toBe(true)

		todos.destroy()
	})

	it('fires when items are added', () => {
		const todos = collection('col-watch-add', { default: [] as Todo[] })

		const listener = vi.fn()

		todos.add({ id: '1', text: 'first', done: false })
		todos.watch('done', listener)

		todos.add({ id: '2', text: 'second', done: true })

		expect(listener).toHaveBeenCalledTimes(1)

		todos.destroy()
	})

	it('fires when items are removed', () => {
		const todos = collection('col-watch-remove', { default: [] as Todo[] })

		todos.add({ id: '1', text: 'first', done: false }, { id: '2', text: 'second', done: true })

		const listener = vi.fn()

		todos.watch('done', listener)

		todos.remove((t) => t.id === '2')

		expect(listener).toHaveBeenCalledTimes(1)

		todos.destroy()
	})

	it('cleans up watch listeners on destroy', () => {
		const todos = collection('col-watch-destroy', { default: [] as Todo[] })

		todos.add({ id: '1', text: 'hello', done: false })

		const listener = vi.fn()

		todos.watch('done', listener)
		todos.destroy()

		// New instance — old listener should not fire
		const todos2 = collection('col-watch-destroy', { default: [] as Todo[] })

		todos2.add({ id: '1', text: 'hello', done: false })
		todos2.update((t) => t.id === '1', { done: true })

		expect(listener).not.toHaveBeenCalled()

		todos2.destroy()
	})
})
