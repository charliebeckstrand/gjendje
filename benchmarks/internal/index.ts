import { execSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// ==========================================================================
// Internal Benchmark Runner — runs all *.bench.ts files in this directory
//
// Usage:
//   pnpm bench:internal:all                    # run all
//   pnpm bench:internal:all --quick            # faster iteration
//   pnpm bench:internal:all -- lifecycle       # filter by filename
// ==========================================================================

const dir = new URL('.', import.meta.url).pathname
const args = process.argv.slice(2)

// Separate filters from flags
const flags: string[] = []
const filters: string[] = []

for (const arg of args) {
	if (arg === '--') continue

	if (arg.startsWith('--')) {
		flags.push(arg)
	} else {
		filters.push(arg.toLowerCase())
	}
}

// Discover all .bench.ts files
const benchFiles = readdirSync(dir)
	.filter((f) => f.endsWith('.bench.ts'))
	.sort()

const selected =
	filters.length === 0
		? benchFiles
		: benchFiles.filter((f) => filters.some((filt) => f.toLowerCase().includes(filt)))

if (selected.length === 0) {
	console.log(`No benchmark files matched: ${filters.join(', ')}`)
	console.log('Available files:')

	for (const f of benchFiles) {
		console.log(`  - ${f}`)
	}

	process.exit(1)
}

console.log('='.repeat(70))
console.log('  Internal Benchmark Runner')
console.log(`  Running ${selected.length}/${benchFiles.length} files`)

if (flags.length > 0) {
	console.log(`  Flags: ${flags.join(' ')}`)
}

console.log('='.repeat(70))
console.log('')

for (const file of selected) {
	const filePath = resolve(dir, file)

	try {
		execSync(`npx tsx "${filePath}" ${flags.join(' ')}`, {
			stdio: 'inherit',
			cwd: resolve(dir, '../..'),
		})
	} catch {
		console.error(`\nFailed to run: ${file}\n`)
	}
}

console.log('')
console.log('='.repeat(70))
console.log('  All benchmarks complete.')
console.log('='.repeat(70))
