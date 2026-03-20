// Ambient type declarations for vitest — allows typecheck without node_modules.
// In a real project with node_modules, real vitest types take precedence.
declare module 'vitest' {
	type Awaitable<T> = T | PromiseLike<T>
	// biome-ignore lint/suspicious/noExplicitAny: mock needs to accept any args
	type Procedure = (...args: any[]) => any

	interface MockInstance<T extends Procedure = Procedure> {
		(...args: Parameters<T>): ReturnType<T>
		mock: {
			calls: Parameters<T>[]
			results: Array<{ type: 'return' | 'throw'; value: ReturnType<T> }>
		}
		mockClear(): this
		mockReset(): this
		mockImplementation(fn: T): this
		mockReturnValue(val: ReturnType<T>): this
		mockResolvedValue(val: Awaited<ReturnType<T>>): this
	}

	type Mock<T extends Procedure = Procedure> = MockInstance<T>

	interface ExpectStatic {
		objectContaining(obj: Record<string, unknown>): unknown
		arrayContaining(arr: unknown[]): unknown
		stringContaining(str: string): unknown
	}

	interface Matchers {
		toBe(expected: unknown): void
		toEqual(expected: unknown): void
		toStrictEqual(expected: unknown): void
		toBeNull(): void
		toBeUndefined(): void
		toBeTruthy(): void
		toBeFalsy(): void
		toBeNaN(): void
		toBeGreaterThan(n: number): void
		toBeGreaterThanOrEqual(n: number): void
		toBeLessThanOrEqual(n: number): void
		toHaveLength(n: number): void
		toHaveBeenCalled(): void
		toHaveBeenCalledTimes(n: number): void
		toHaveBeenCalledWith(...args: unknown[]): void
		toHaveBeenLastCalledWith(...args: unknown[]): void
		toContain(item: unknown): void
		toThrow(msg?: string | RegExp): void
		resolves: Matchers & { toBeUndefined(): Promise<void> }
		not: Matchers
	}

	function describe(name: string, fn: () => void): void
	function it(name: string, fn: () => Awaitable<void>): void
	function test(name: string, fn: () => Awaitable<void>): void
	const expect: ExpectStatic & (<T>(val: T) => Matchers)
	function beforeEach(fn: () => Awaitable<void>): void
	function afterEach(fn: () => Awaitable<void>): void

	interface SpyInstance<T extends Procedure = Procedure> extends MockInstance<T> {
		mockRestore(): void
	}

	const vi: {
		fn<T extends Procedure = Procedure>(impl?: T): Mock<T>
		fn(): Mock
		// biome-ignore lint/suspicious/noExplicitAny: spy target can be any object
		spyOn<T extends Record<string, any>, K extends keyof T>(
			obj: T,
			method: K,
		): SpyInstance<T[K] extends Procedure ? T[K] : Procedure>
	}
}
