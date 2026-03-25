import { defineConfig } from 'tsup'

export default defineConfig({
	entry: {
		index: 'src/index.ts',
		server: 'src/server.ts',
		react: 'src/react/index.ts',
		vue: 'src/vue/index.ts',
		devtools: 'src/devtools/index.ts',
	},
	format: ['esm', 'cjs'],
	dts: true,
	splitting: true,
	treeshake: true,
	external: ['react', 'vue'],
	clean: true,
	sourcemap: false,
	outDir: 'dist',
})
