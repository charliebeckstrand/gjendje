import { Bench } from 'tinybench'

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatOps(hz: number): string {
	if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(2)}M ops/s`
	if (hz >= 1_000) return `${(hz / 1_000).toFixed(2)}K ops/s`

	return `${hz.toFixed(2)} ops/s`
}

export function printResults(bench: Bench) {
	const tasks = bench.tasks.map((t) => {
		const r = t.result as Record<string, unknown> | undefined

		const throughput = r?.throughput as Record<string, number> | undefined

		const latency = r?.latency as Record<string, number> | undefined

		return {
			name: t.name,
			hz: throughput?.mean ?? 0,
			mean: latency?.mean ?? 0,
			p99: latency?.p99 ?? 0,
		}
	})

	tasks.sort((a, b) => b.hz - a.hz)

	const fastest = tasks[0]

	console.log('')

	for (const t of tasks) {
		const ratio = fastest && t.hz > 0 ? (fastest.hz / t.hz).toFixed(2) : '-'

		const marker = t === fastest ? ' ⇐ fastest' : ''

		console.log(
			`  ${t.name.padEnd(44)} ${formatOps(t.hz).padStart(16)}   (avg ${t.mean.toFixed(4)}ms, p99 ${t.p99.toFixed(4)}ms)  ${ratio === '1.00' ? '' : `${ratio}x slower`}${marker}`,
		)
	}

	console.log('')
}

// ---------------------------------------------------------------------------
// Unique keys
// ---------------------------------------------------------------------------

let keyId = 0

export function uniqueKey(prefix: string): string {
	return `${prefix}-${keyId++}`
}

// ---------------------------------------------------------------------------
// Suite runner with CLI filter
// ---------------------------------------------------------------------------

export type Suite = {
	name: string
	fn: () => Promise<void>
}

/**
 * Run benchmark suites with optional CLI filter.
 *
 * Usage:
 *   pnpm tsx benchmarks/file.bench.ts              # run all suites
 *   pnpm tsx benchmarks/file.bench.ts diamond       # run suites matching "diamond"
 *   pnpm tsx benchmarks/file.bench.ts diamond watch  # run suites matching either
 *
 * Matching is case-insensitive substring against the suite name.
 */
export async function runSuites(title: string, suites: Suite[]) {
	const filters = process.argv.slice(2).map((f) => f.toLowerCase())

	const selected =
		filters.length === 0
			? suites
			: suites.filter((s) => filters.some((f) => s.name.toLowerCase().includes(f)))

	if (selected.length === 0) {
		console.log(`No suites matched: ${filters.join(', ')}`)
		console.log(`Available suites:`)

		for (const s of suites) {
			console.log(`  - ${s.name}`)
		}

		process.exit(1)
	}

	console.log('='.repeat(70))
	console.log(`  ${title}`)

	if (filters.length > 0) {
		console.log(`  (filtered: ${selected.length}/${suites.length} suites)`)
	}

	console.log('='.repeat(70))

	for (const suite of selected) {
		await suite.fn()
	}

	console.log('='.repeat(70))
	console.log('  Done.')
	console.log('='.repeat(70))
}
