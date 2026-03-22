// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { server, state } from '../src/index.js'
import { withServerSession } from '../src/server.js'

describe('server scope', () => {
	it('returns default when called outside a session', () => {
		const user = state('srv-default', { default: null as { id: string } | null, scope: 'server' })

		expect(user.get()).toBeNull()

		user.destroy()
	})

	it('throws on set outside a session', () => {
		const user = state('srv-throw', { default: null as { id: string } | null, scope: 'server' })

		expect(() => user.set({ id: '1' })).toThrow('[state]')

		user.destroy()
	})

	it('reads and writes within a session', async () => {
		const user = state('srv-readwrite', {
			default: null as { id: string } | null,
			scope: 'server',
		})

		await withServerSession(async () => {
			user.set({ id: 'abc' })

			expect(user.get()).toEqual({ id: 'abc' })
		})

		user.destroy()
	})

	it('isolates state between concurrent sessions', async () => {
		const requestUser = state('srv-isolate', {
			default: null as string | null,
			scope: 'server',
		})

		const results: Array<string | null> = []

		await Promise.all([
			withServerSession(async () => {
				requestUser.set('alice')
				await new Promise((r) => setTimeout(r, 10))
				results.push(requestUser.get())
			}),
			withServerSession(async () => {
				requestUser.set('bob')
				await new Promise((r) => setTimeout(r, 5))
				results.push(requestUser.get())
			}),
		])

		expect(results).toContain('alice')
		expect(results).toContain('bob')

		requestUser.destroy()
	})

	it('notifies subscribers within a session', async () => {
		const value = state('srv-notify', { default: 0, scope: 'server' })
		const calls: number[] = []

		value.subscribe((v) => calls.push(v))

		await withServerSession(async () => {
			value.set(1)
			value.set(2)
		})

		expect(calls).toEqual([1, 2])

		value.destroy()
	})

	it('supports updater function within a session', async () => {
		const count = state('srv-updater', { default: 0, scope: 'server' })

		await withServerSession(async () => {
			count.set((prev) => prev + 1)
			count.set((prev) => prev + 1)

			expect(count.get()).toBe(2)
		})

		count.destroy()
	})
})

describe('server() shortcut', () => {
	it('creates state with server scope', () => {
		const s = server({ user: null as string | null })

		expect(s.get()).toBeNull()
		expect(s.scope).toBe('server')
		expect(s.key).toBe('user')

		s.destroy()
	})

	it('reads and writes within a session', async () => {
		const s = server({ lang: 'en' })

		await withServerSession(async () => {
			s.set('fr')

			expect(s.get()).toBe('fr')
		})

		s.destroy()
	})

	it('passes through extra options', async () => {
		const s = server({ count: 0 }, { isEqual: (a, b) => a === b })

		expect(s.get()).toBe(0)
		expect(s.scope).toBe('server')

		s.destroy()
	})
})
