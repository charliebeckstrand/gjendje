import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collection, configure, state } from '../src/index.js'
import { makeStorage, setupFullBrowserEnv } from './helpers.js'

beforeEach(() => {
	configure({
		onError: undefined,
		onValidationFail: undefined,
		onMigrate: undefined,
		logLevel: undefined,
		requireValidation: undefined,
	})

	setupFullBrowserEnv()
})

// ---------------------------------------------------------------------------
// Collection + persistence + validation
// ---------------------------------------------------------------------------

describe('collection + persistence + validation', () => {
	interface Todo {
		id: string
		text: string
		done: boolean
	}

	const isValidTodos = (v: unknown): v is Todo[] =>
		Array.isArray(v) &&
		v.every(
			(item) =>
				typeof item === 'object' &&
				item !== null &&
				typeof item.id === 'string' &&
				typeof item.text === 'string' &&
				typeof item.done === 'boolean',
		)

	it('collection reads valid data from storage', () => {
		localStorage.setItem('col-valid', JSON.stringify([{ id: '1', text: 'Buy milk', done: false }]))

		const todos = collection('col-valid', {
			default: [] as Todo[],
			scope: 'local',
			validate: isValidTodos,
		})

		expect(todos.size).toBe(1)
		expect(todos.get()[0]?.text).toBe('Buy milk')

		todos.destroy()
	})

	it('collection falls back to default when stored data fails validation', () => {
		// Store data with wrong shape (missing 'done' field)
		localStorage.setItem('col-invalid', JSON.stringify([{ id: '1', text: 'no done field' }]))

		const onValidationFail = vi.fn()

		configure({ onValidationFail })

		const todos = collection('col-invalid', {
			default: [] as Todo[],
			scope: 'local',
			validate: isValidTodos,
		})

		// Validation failed — falls back to empty array
		expect(todos.size).toBe(0)
		expect(todos.get()).toEqual([])
		expect(onValidationFail).toHaveBeenCalledWith(
			expect.objectContaining({ key: 'col-invalid', scope: 'local' }),
		)

		todos.destroy()
	})

	it('collection with migration upgrades stored data', () => {
		// v1 format: items have 'completed' instead of 'done'
		localStorage.setItem(
			'col-migrate',
			JSON.stringify({
				v: 1,
				data: [{ id: '1', text: 'old format', completed: true }],
			}),
		)

		const todos = collection('col-migrate', {
			default: [] as Todo[],
			scope: 'local',
			version: 2,
			migrate: {
				1: (old: unknown) => {
					const items = old as Array<{ id: string; text: string; completed: boolean }>

					return items.map((item) => ({
						id: item.id,
						text: item.text,
						done: item.completed,
					}))
				},
			},
			validate: isValidTodos,
		})

		expect(todos.size).toBe(1)
		expect(todos.get()[0]).toEqual({ id: '1', text: 'old format', done: true })

		todos.destroy()
	})

	it('collection add/remove round-trips through persistent storage', () => {
		const todos = collection('col-add-persist', {
			default: [] as Todo[],
			scope: 'local',
		})

		todos.add({ id: '1', text: 'first', done: false })
		todos.add({ id: '2', text: 'second', done: true })
		todos.remove((t) => t.id === '1')
		todos.destroy()

		// Re-read from storage
		const restored = collection('col-add-persist', {
			default: [] as Todo[],
			scope: 'local',
		})

		expect(restored.size).toBe(1)
		expect(restored.get()[0]?.text).toBe('second')

		restored.destroy()
	})

	it('collection update persists through storage round-trip', () => {
		const todos = collection('col-update-persist', {
			default: [] as Todo[],
			scope: 'local',
		})

		todos.add({ id: '1', text: 'todo', done: false })
		todos.update((t) => t.id === '1', { done: true })
		todos.destroy()

		const restored = collection('col-update-persist', {
			default: [] as Todo[],
			scope: 'local',
		})

		expect(restored.get()[0]?.done).toBe(true)

		restored.destroy()
	})

	it('collection with corrupted storage falls back to default', () => {
		localStorage.setItem('col-corrupt', 'not-valid-json{{{')

		const todos = collection('col-corrupt', {
			default: [] as Todo[],
			scope: 'local',
		})

		// Corrupt JSON parse fails — falls back to empty array
		expect(todos.size).toBe(0)
		expect(todos.get()).toEqual([])

		todos.destroy()
	})

	it('collection clear() persists empty array to storage', () => {
		const todos = collection('col-clear-persist', {
			default: [] as Todo[],
			scope: 'local',
		})

		todos.add({ id: '1', text: 'item', done: false })
		todos.clear()
		todos.destroy()

		const restored = collection('col-clear-persist', {
			default: [] as Todo[],
			scope: 'local',
		})

		expect(restored.size).toBe(0)

		restored.destroy()
	})
})

// ---------------------------------------------------------------------------
// URL adapter error recovery and edge cases
// ---------------------------------------------------------------------------

describe('url adapter error recovery', () => {
	function setupWindow(search = '') {
		const location = { pathname: '/app', search, hash: '' }

		Object.defineProperty(globalThis, 'window', {
			value: {
				location,
				history: {
					pushState(_: unknown, __: string, url: string) {
						const parsed = new URL(url, 'http://localhost')

						location.pathname = parsed.pathname
						location.search = parsed.search
						location.hash = parsed.hash
					},
				},
				addEventListener: () => {},
				removeEventListener: () => {},
			},
			configurable: true,
			writable: true,
		})
	}

	it('returns default when URL param contains unparseable data', () => {
		setupWindow('?url-bad=not%20valid%20json')

		const x = state('url-bad', { default: 42, scope: 'url' })

		// Parse error caught — falls back to default
		expect(x.get()).toBe(42)

		x.destroy()
	})

	it('writes and reads back complex objects from URL', () => {
		setupWindow()

		const filters = state('url-obj', {
			default: { status: 'all', page: 1 },
			scope: 'url',
		})

		filters.set({ status: 'active', page: 3 })

		expect(filters.get()).toEqual({ status: 'active', page: 3 })

		filters.destroy()
	})

	it('handles multiple URL-scoped states independently', () => {
		setupWindow()

		const page = state('url-page', { default: 1, scope: 'url' })

		const sort = state('url-sort', { default: 'name', scope: 'url' })

		page.set(5)
		sort.set('date')

		expect(page.get()).toBe(5)
		expect(sort.get()).toBe('date')

		// Both params in URL
		expect(window.location.search).toContain('url-page=')
		expect(window.location.search).toContain('url-sort=')

		page.destroy()
		sort.destroy()
	})

	it('reset removes param and restores default', () => {
		setupWindow()

		const x = state('url-reset-edge', { default: 'initial', scope: 'url' })

		x.set('changed')
		expect(window.location.search).toContain('url-reset-edge=')

		x.reset()
		expect(x.get()).toBe('initial')
		expect(window.location.search).not.toContain('url-reset-edge=')

		x.destroy()
	})

	it('reads pre-existing URL param on creation', () => {
		setupWindow('?url-preexist=99')

		const x = state('url-preexist', { default: 0, scope: 'url' })

		expect(x.get()).toBe(99)

		x.destroy()
	})

	it('handles URL param with special characters', () => {
		setupWindow()

		const x = state('url-special', { default: '', scope: 'url' })

		x.set('hello world & more=stuff')

		// Read back preserves the value
		expect(x.get()).toBe('hello world & more=stuff')

		x.destroy()
	})

	it('gracefully handles pushState failure', () => {
		const location = { pathname: '/app', search: '', hash: '' }

		Object.defineProperty(globalThis, 'window', {
			value: {
				location,
				history: {
					pushState() {
						throw new Error('SecurityError: sandboxed iframe')
					},
				},
				addEventListener: () => {},
				removeEventListener: () => {},
			},
			configurable: true,
			writable: true,
		})

		const x = state('url-push-err', { default: 0, scope: 'url' })

		// set() doesn't throw even if pushState fails
		expect(() => x.set(42)).not.toThrow()

		x.destroy()
	})

	it('custom serializer is used for URL state', () => {
		setupWindow()

		const x = state('url-custom-ser', {
			default: [1, 2, 3],
			scope: 'url',
			serialize: {
				stringify: (v: number[]) => v.join(','),
				parse: (raw: string) => raw.split(',').map(Number),
			},
		})

		x.set([4, 5, 6])

		expect(window.location.search).toContain('url-custom-ser=4%2C5%2C6')

		expect(x.get()).toEqual([4, 5, 6])

		x.destroy()
	})

	it('URL state with persist option only stores selected keys', () => {
		setupWindow()

		const x = state('url-persist', {
			default: { page: 1, sort: 'name', internal: 'hidden' },
			scope: 'url',
			persist: ['page', 'sort'],
		})

		x.set({ page: 3, sort: 'date', internal: 'secret' })

		// URL should contain page and sort but not internal
		const search = window.location.search
		const params = new URLSearchParams(search)
		const raw = params.get('url-persist')

		expect(raw).not.toBeNull()

		const parsed = JSON.parse(raw ?? '')

		expect(parsed).toEqual({ page: 3, sort: 'date' })

		// But get() merges defaults back, so internal is included
		expect(x.get()).toEqual({ page: 3, sort: 'date', internal: 'hidden' })

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// Config callback isolation in adapters and persist pipeline
// ---------------------------------------------------------------------------

describe('adapter config callback isolation', () => {
	beforeEach(() => {
		configure({
			onError: undefined,
			onValidationFail: undefined,
			onMigrate: undefined,
			onQuotaExceeded: undefined,
			logLevel: undefined,
		})
	})

	it('throwing onValidationFail does not crash state read', () => {
		localStorage.setItem('cfg-valfail-err', JSON.stringify({ bad: true }))

		configure({
			onValidationFail: () => {
				throw new Error('onValidationFail boom')
			},
		})

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const x = state('cfg-valfail-err', {
			default: 'safe',
			scope: 'local',
			validate: (v: unknown): v is string => typeof v === 'string',
		})

		// Falls back to default despite onValidationFail throwing
		expect(x.get()).toBe('safe')
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining('[gjendje] Config callback threw:'),
			expect.any(Error),
		)

		spy.mockRestore()
		x.destroy()
	})

	it('throwing onError in validation path does not crash state read', () => {
		localStorage.setItem('cfg-onerr-val', JSON.stringify(123))

		configure({
			onError: () => {
				throw new Error('onError boom')
			},
		})

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const x = state('cfg-onerr-val', {
			default: 'fallback',
			scope: 'local',
			validate: (v: unknown): v is string => typeof v === 'string',
		})

		expect(x.get()).toBe('fallback')
		expect(spy).toHaveBeenCalled()

		spy.mockRestore()
		x.destroy()
	})

	it('throwing onMigrate does not crash state read', () => {
		localStorage.setItem('cfg-mig-err', JSON.stringify({ v: 1, data: 'old' }))

		configure({
			onMigrate: () => {
				throw new Error('onMigrate boom')
			},
		})

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const x = state('cfg-mig-err', {
			default: 'default',
			scope: 'local',
			version: 2,
			migrate: { 1: (old: unknown) => `${old}-migrated` },
		})

		// Migration still runs — only the onMigrate callback is isolated
		expect(x.get()).toBe('old-migrated')
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining('[gjendje] Config callback threw:'),
			expect.any(Error),
		)

		spy.mockRestore()
		x.destroy()
	})

	it('throwing onError in migration failure path does not crash state read', () => {
		localStorage.setItem('cfg-onerr-mig', JSON.stringify({ v: 1, data: 'old' }))

		configure({
			onError: () => {
				throw new Error('onError in migration boom')
			},
			logLevel: 'silent',
		})

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const x = state('cfg-onerr-mig', {
			default: 'default',
			scope: 'local',
			version: 2,
			migrate: {
				1: () => {
					throw new Error('migration itself fails')
				},
			},
		})

		// Falls back to partially-migrated (original) value despite onError throwing
		expect(x.get()).toBe('old')
		expect(spy).toHaveBeenCalled()

		spy.mockRestore()
		x.destroy()
	})

	it('throwing onQuotaExceeded does not crash storage write', () => {
		const quota = makeStorage()

		quota.setItem = () => {
			throw new DOMException('quota exceeded', 'QuotaExceededError')
		}

		Object.defineProperty(globalThis, 'localStorage', {
			value: quota,
			configurable: true,
		})

		configure({
			onQuotaExceeded: () => {
				throw new Error('onQuotaExceeded boom')
			},
			logLevel: 'silent',
		})

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const x = state('cfg-quota-err', {
			default: 'ok',
			scope: 'local',
		})

		// set() triggers quota error internally but doesn't throw
		expect(() => x.set('big-data')).not.toThrow()
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining('[gjendje] Config callback threw:'),
			expect.any(Error),
		)

		spy.mockRestore()
		x.destroy()
	})

	it('throwing onRegister does not crash state creation', () => {
		configure({
			onRegister: () => {
				throw new Error('onRegister boom')
			},
		})

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const x = state('cfg-register-err', { default: 0, scope: 'memory' })

		// State was created successfully despite onRegister throwing
		expect(x.get()).toBe(0)
		x.set(42)
		expect(x.get()).toBe(42)

		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining('[gjendje] Config callback threw:'),
			expect.any(Error),
		)

		spy.mockRestore()
		x.destroy()
	})

	it('throwing onError in reportError does not crash the operation', () => {
		configure({
			onError: () => {
				throw new Error('onError itself throws')
			},
			logLevel: 'silent',
		})

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		// reportError is called internally; we trigger it via a write failure
		// by creating a storage adapter with a full quota
		const original = localStorage.setItem

		// biome-ignore lint/suspicious/noExplicitAny: test mock
		;(localStorage as any).setItem = () => {
			throw new DOMException('QuotaExceededError')
		}

		const x = state('cfg-report-err', {
			default: 'safe',
			scope: 'local',
		})

		x.set('boom')

		// biome-ignore lint/suspicious/noExplicitAny: test mock
		;(localStorage as any).setItem = original

		const onErrorCall = spy.mock.calls.find(
			(args) => typeof args[0] === 'string' && args[0].includes('onError callback threw'),
		)

		expect(onErrorCall).toBeDefined()

		spy.mockRestore()
		x.destroy()
	})
})
