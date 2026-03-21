import { describe, expect, it, vi } from 'vitest'
import { withHistory } from '../src/enhancers/history.js'
import { state } from '../src/index.js'

describe('withHistory', () => {
	it('tracks history on set()', () => {
		const base = state('h-basic', { default: 0, scope: 'render' })
		const h = withHistory(base)

		h.set(1)
		h.set(2)
		h.set(3)

		expect(h.get()).toBe(3)
		expect(h.canUndo).toBe(true)
		expect(h.canRedo).toBe(false)
	})

	it('undo reverts to previous value', () => {
		const base = state('h-undo', { default: 'a', scope: 'render' })
		const h = withHistory(base)

		h.set('b')
		h.set('c')

		h.undo()
		expect(h.get()).toBe('b')

		h.undo()
		expect(h.get()).toBe('a')

		expect(h.canUndo).toBe(false)
	})

	it('redo re-applies undone value', () => {
		const base = state('h-redo', { default: 0, scope: 'render' })
		const h = withHistory(base)

		h.set(1)
		h.set(2)

		h.undo()
		expect(h.get()).toBe(1)

		h.redo()
		expect(h.get()).toBe(2)

		expect(h.canRedo).toBe(false)
	})

	it('new set() after undo clears redo stack', () => {
		const base = state('h-clear-redo', { default: 0, scope: 'render' })
		const h = withHistory(base)

		h.set(1)
		h.set(2)

		h.undo() // back to 1
		h.set(3) // new branch

		expect(h.canRedo).toBe(false)
		expect(h.get()).toBe(3)

		h.undo()
		expect(h.get()).toBe(1)
	})

	it('respects maxSize option', () => {
		const base = state('h-max', { default: 0, scope: 'render' })
		const h = withHistory(base, { maxSize: 3 })

		h.set(1)
		h.set(2)
		h.set(3)
		h.set(4)

		// Only 3 entries kept — original 0 is pushed out
		h.undo() // 3
		h.undo() // 2
		h.undo() // 1

		expect(h.get()).toBe(1)
		expect(h.canUndo).toBe(false)
	})

	it('clearHistory empties both stacks', () => {
		const base = state('h-clear', { default: 0, scope: 'render' })
		const h = withHistory(base)

		h.set(1)
		h.set(2)
		h.undo()

		expect(h.canUndo).toBe(true)
		expect(h.canRedo).toBe(true)

		h.clearHistory()

		expect(h.canUndo).toBe(false)
		expect(h.canRedo).toBe(false)
	})

	it('undo/redo are no-ops when stacks are empty', () => {
		const base = state('h-noop', { default: 42, scope: 'render' })
		const h = withHistory(base)

		h.undo()
		expect(h.get()).toBe(42)

		h.redo()
		expect(h.get()).toBe(42)
	})

	it('notifies subscribers on undo/redo', () => {
		const base = state('h-notify', { default: 0, scope: 'render' })
		const h = withHistory(base)

		h.set(1)

		const listener = vi.fn()

		h.subscribe(listener)

		h.undo()
		expect(listener).toHaveBeenCalledWith(0)

		h.redo()
		expect(listener).toHaveBeenCalledWith(1)
	})

	it('delegates lifecycle properties from the wrapped instance', () => {
		const base = state('h-delegate', { default: 0, scope: 'render' })
		const h = withHistory(base)

		expect(h.key).toBe('h-delegate')
		expect(h.scope).toBe('render')
		expect(h.isDestroyed).toBe(false)
	})

	it('destroy cleans up history', () => {
		const base = state('h-destroy', { default: 0, scope: 'render' })
		const h = withHistory(base)

		h.set(1)
		h.destroy()

		expect(h.canUndo).toBe(false)
		expect(h.isDestroyed).toBe(true)
	})
})
