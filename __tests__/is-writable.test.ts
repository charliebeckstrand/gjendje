import { describe, expect, it } from 'vitest'
import { withHistory } from '../src/enhancers/history.js'
import { withWatch } from '../src/enhancers/watch.js'
import { collection, computed, readonly, select, state } from '../src/index.js'
import { isWritable } from '../src/is-writable.js'
import { previous } from '../src/previous.js'

describe('isWritable', () => {
	it('returns true for a writable state instance', () => {
		const s = state('iw-writable', { default: 0, scope: 'memory' })

		expect(isWritable(s)).toBe(true)
	})

	it('returns false for a readonly wrapper', () => {
		const s = state('iw-readonly', { default: 0, scope: 'memory' })

		const ro = readonly(s)

		expect(isWritable(ro)).toBe(false)
	})

	it('returns false for a computed instance', () => {
		const s = state('iw-comp-src', { default: 0, scope: 'memory' })

		const c = computed([s], ([v]) => (v ?? 0) * 2)

		expect(isWritable(c)).toBe(false)
	})

	it('returns true for state even after set/reset', () => {
		const s = state('iw-after-ops', { default: 'hello', scope: 'memory' })

		s.set('world')
		s.reset()

		expect(isWritable(s)).toBe(true)
	})

	it('returns false for a select instance', () => {
		const s = state('iw-select-src', { default: 10, scope: 'memory' })

		const sel = select(s, (v) => (v ?? 0) + 1)

		expect(isWritable(sel)).toBe(false)

		sel.destroy()
		s.destroy()
	})

	it('returns false for a previous instance', () => {
		const s = state('iw-prev-src', { default: 'a', scope: 'memory' })

		const prev = previous(s)

		expect(isWritable(prev)).toBe(false)

		prev.destroy()
		s.destroy()
	})

	it('returns true for a collection instance', () => {
		const col = collection<number>('iw-collection', { default: [1, 2], scope: 'memory' })

		expect(isWritable(col)).toBe(true)

		col.destroy()
	})

	it('returns true for a withWatch wrapped instance', () => {
		const s = state('iw-watch', { default: { x: 1 }, scope: 'memory' })

		const watched = withWatch(s)

		expect(isWritable(watched)).toBe(true)

		watched.destroy()
	})

	it('returns true for a withHistory wrapped instance', () => {
		const s = state('iw-history', { default: 0, scope: 'memory' })

		const h = withHistory(s)

		expect(isWritable(h)).toBe(true)

		h.destroy()
		s.destroy()
	})

	it('returns true for state after destroy', () => {
		const s = state('iw-destroyed', { default: 42, scope: 'memory' })

		s.destroy()

		expect(isWritable(s)).toBe(true)
	})

	it('returns false for a plain object with no set method', () => {
		expect(isWritable({} as never)).toBe(false)
	})

	it('returns false for a plain object with set as a non-function', () => {
		expect(isWritable({ set: 'not a function' } as never)).toBe(false)
	})
})
