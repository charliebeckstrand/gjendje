import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collection, computed, select, state } from '../src/index.js'
import { useSelector, useValue, useWatch } from '../src/react.js'

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

afterEach(() => {
	cleanup()
})

function makeStorage(): Storage {
	const store = new Map<string, string>()

	return {
		getItem: (k) => store.get(k) ?? null,
		setItem: (k, v) => {
			store.set(k, v)
		},
		removeItem: (k) => {
			store.delete(k)
		},
		clear: () => {
			store.clear()
		},
		get length() {
			return store.size
		},
		key: (i) => [...store.keys()][i] ?? null,
	}
}

// ---------------------------------------------------------------------------
// useValue
// ---------------------------------------------------------------------------

describe('useValue', () => {
	it('reads the current value from a state instance', () => {
		const count = state('rv-read', { default: 42 })

		function App() {
			const value = useValue(count)
			return <span data-testid="value">{value}</span>
		}

		render(<App />)

		expect(screen.getByTestId('value').textContent).toBe('42')
	})

	it('re-renders when the value changes', () => {
		const count = state('rv-rerender', { default: 0 })

		function App() {
			const value = useValue(count)
			return <span data-testid="value">{value}</span>
		}

		render(<App />)

		expect(screen.getByTestId('value').textContent).toBe('0')

		act(() => {
			count.set(1)
		})

		expect(screen.getByTestId('value').textContent).toBe('1')
	})

	it('works with computed instances', () => {
		const a = state('rv-comp-a', { default: 2 })
		const b = state('rv-comp-b', { default: 3 })
		const sum = computed([a, b], ([x, y]) => (x as number) + (y as number))

		function App() {
			const value = useValue(sum)
			return <span data-testid="value">{value}</span>
		}

		render(<App />)

		expect(screen.getByTestId('value').textContent).toBe('5')

		act(() => {
			a.set(10)
		})

		expect(screen.getByTestId('value').textContent).toBe('13')
	})

	it('works with select instances', () => {
		const user = state('rv-sel', { default: { name: 'Jane', age: 30 } })
		const name = select(user, (u) => u.name)

		function App() {
			const value = useValue(name)
			return <span data-testid="value">{value}</span>
		}

		render(<App />)

		expect(screen.getByTestId('value').textContent).toBe('Jane')

		act(() => {
			user.set({ name: 'John', age: 30 })
		})

		expect(screen.getByTestId('value').textContent).toBe('John')
	})

	it('works with collection instances', () => {
		const items = collection('rv-col', { default: ['a', 'b'] })

		function App() {
			const value = useValue(items)
			return <span data-testid="value">{value.join(',')}</span>
		}

		render(<App />)

		expect(screen.getByTestId('value').textContent).toBe('a,b')

		act(() => {
			items.add('c')
		})

		expect(screen.getByTestId('value').textContent).toBe('a,b,c')
	})

	it('does not re-render when set to the same value', () => {
		const count = state('rv-same', { default: 5 })
		const renderCount = vi.fn()

		function App() {
			const value = useValue(count)
			renderCount()
			return <span data-testid="value">{value}</span>
		}

		render(<App />)

		expect(renderCount).toHaveBeenCalledTimes(1)

		act(() => {
			count.set(5) // same value
		})

		// Should not trigger extra render — gjendje skips notification for same value
		expect(renderCount).toHaveBeenCalledTimes(1)
	})

	it('unsubscribes on unmount', () => {
		const count = state('rv-unsub', { default: 0 })
		const renderCount = vi.fn()

		function App() {
			const value = useValue(count)
			renderCount()
			return <span>{value}</span>
		}

		const { unmount } = render(<App />)

		expect(renderCount).toHaveBeenCalledTimes(1)

		unmount()

		act(() => {
			count.set(99)
		})

		// Should not render after unmount
		expect(renderCount).toHaveBeenCalledTimes(1)
	})
})

// ---------------------------------------------------------------------------
// useSelector
// ---------------------------------------------------------------------------

describe('useSelector', () => {
	it('selects a derived value from an instance', () => {
		const user = state('rs-basic', { default: { name: 'Jane', age: 30 } })

		function App() {
			const name = useSelector(user, (u) => u.name)
			return <span data-testid="name">{name}</span>
		}

		render(<App />)

		expect(screen.getByTestId('name').textContent).toBe('Jane')
	})

	it('re-renders only when selected value changes', () => {
		const user = state('rs-selective', { default: { name: 'Jane', age: 30 } })
		const renderCount = vi.fn()

		function NameDisplay() {
			const name = useSelector(user, (u) => u.name)
			renderCount()
			return <span data-testid="name">{name}</span>
		}

		render(<NameDisplay />)

		expect(renderCount).toHaveBeenCalledTimes(1)

		// Change age only — name selector should skip re-render
		act(() => {
			user.set({ name: 'Jane', age: 31 })
		})

		expect(renderCount).toHaveBeenCalledTimes(1)

		// Change name — should re-render
		act(() => {
			user.set({ name: 'John', age: 31 })
		})

		expect(renderCount).toHaveBeenCalledTimes(2)
		expect(screen.getByTestId('name').textContent).toBe('John')
	})

	it('supports a custom equality function', () => {
		const nums = state('rs-custom-eq', { default: { values: [1, 2, 3] } })
		const renderCount = vi.fn()

		const arraysEqual = (a: number[], b: number[]) =>
			a.length === b.length && a.every((v, i) => v === b[i])

		function ValuesDisplay() {
			const values = useSelector(nums, (n) => n.values, arraysEqual)
			renderCount()
			return <span data-testid="values">{values.join(',')}</span>
		}

		render(<ValuesDisplay />)

		expect(renderCount).toHaveBeenCalledTimes(1)

		// Set same array contents in a new reference — custom equality should prevent re-render
		act(() => {
			nums.set({ values: [1, 2, 3] })
		})

		expect(renderCount).toHaveBeenCalledTimes(1)

		// Actually change the values
		act(() => {
			nums.set({ values: [4, 5] })
		})

		expect(renderCount).toHaveBeenCalledTimes(2)
		expect(screen.getByTestId('values').textContent).toBe('4,5')
	})

	it('handles selector that transforms data', () => {
		const count = state('rs-transform', { default: 3 })

		function App() {
			const doubled = useSelector(count, (n) => n * 2)
			return <span data-testid="value">{doubled}</span>
		}

		render(<App />)

		expect(screen.getByTestId('value').textContent).toBe('6')

		act(() => {
			count.set(5)
		})

		expect(screen.getByTestId('value').textContent).toBe('10')
	})
})

// ---------------------------------------------------------------------------
// useWatch
// ---------------------------------------------------------------------------

describe('useWatch', () => {
	it('watches a specific key on an object state', () => {
		const settings = state('rw-basic', {
			default: { theme: 'light' as string, fontSize: 14 },
		})

		function ThemeDisplay() {
			const theme = useWatch(settings, 'theme')
			return <span data-testid="theme">{theme}</span>
		}

		render(<ThemeDisplay />)

		expect(screen.getByTestId('theme').textContent).toBe('light')

		act(() => {
			settings.set({ theme: 'dark', fontSize: 14 })
		})

		expect(screen.getByTestId('theme').textContent).toBe('dark')
	})

	it('does not re-render when a different key changes', () => {
		const settings = state('rw-selective', {
			default: { theme: 'light' as string, fontSize: 14 },
		})
		const renderCount = vi.fn()

		function ThemeDisplay() {
			const theme = useWatch(settings, 'theme')
			renderCount()
			return <span data-testid="theme">{theme}</span>
		}

		render(<ThemeDisplay />)

		expect(renderCount).toHaveBeenCalledTimes(1)

		// Change only fontSize — theme watcher should not fire
		act(() => {
			settings.set({ theme: 'light', fontSize: 16 })
		})

		expect(renderCount).toHaveBeenCalledTimes(1)

		// Change theme — should re-render
		act(() => {
			settings.set({ theme: 'dark', fontSize: 16 })
		})

		expect(renderCount).toHaveBeenCalledTimes(2)
		expect(screen.getByTestId('theme').textContent).toBe('dark')
	})
})
