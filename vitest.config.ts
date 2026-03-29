import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		// happy-dom gives us browser globals (localStorage, window, etc.)
		// without the overhead of a full browser. Tests that need Node
		// (e.g. server scope with async_hooks) opt out via @vitest-environment node.
		environment: 'happy-dom',
		globals: true,

		include: ['__tests__/**/*.test.ts'],

		setupFiles: ['__tests__/setup.ts'],

		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.d.ts'],
			thresholds: {
				lines: 90,
				functions: 90,
				branches: 80,
				statements: 90,
			},
		},
	},
})
