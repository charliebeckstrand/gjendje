import { defineConfig } from 'tsup'

export default defineConfig({
	entry: {
		index: 'src/index.ts',
		'react/index': 'src/react/index.ts',
	},
	format: ['esm', 'cjs'],
	dts: true,
	splitting: true,
	treeshake: true,
	clean: true,
	sourcemap: false,
	outDir: 'dist',
	external: ['react'],
})
