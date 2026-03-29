import { Bench } from 'tinybench'
import {
	collectResults,
	getBaselinePath,
	loadBaseline,
	parseFlags,
	printComparison,
	saveBaseline,
	type BaselineData,
	type SuiteResults,
} from './ab.js'

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
		const r = t.result as unknown as Record<string, unknown> | undefined

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
// Bench config (shared, affected by --quick flag)
// ---------------------------------------------------------------------------

export let benchConfig = { time: 1000, warmupTime: 200 }

// ---------------------------------------------------------------------------
// defineSuite — reduces boilerplate in benchmark files
// ---------------------------------------------------------------------------

export type SuiteSetup = (bench: Bench) => void | Promise<void>

export type Suite = {
	name: string
	sectionTitles: string[]
	fn: () => Promise<Bench[]>
}

/**
 * Define a benchmark suite with one or more sections.
 *
 * Each key in `sections` becomes a section header (e.g., "── Title ──").
 * The callback receives a fresh `Bench` instance to add tasks to.
 * The Bench is automatically run and results printed.
 *
 * @example
 * ```ts
 * defineSuite('collection', {
 *     'Collection Operations': (bench) => {
 *         bench.add('collection.add', () => { ... })
 *     },
 * })
 * ```
 */
export function defineSuite(name: string, sections: Record<string, SuiteSetup>): Suite {
	return {
		name,
		sectionTitles: Object.keys(sections),
		fn: async () => {
			const benches: Bench[] = []

			for (const [title, setup] of Object.entries(sections)) {
				const bench = new Bench(benchConfig)

				await setup(bench)

				await bench.run()

				console.log(`── ${title} ──`)

				printResults(bench)

				benches.push(bench)
			}

			return benches
		},
	}
}

// ---------------------------------------------------------------------------
// Suite runner with CLI filter + A/B support
// ---------------------------------------------------------------------------

/**
 * Run benchmark suites with optional CLI flags.
 *
 * Usage:
 *   pnpm tsx benchmarks/file.bench.ts              # run all suites
 *   pnpm tsx benchmarks/file.bench.ts diamond       # run suites matching "diamond"
 *   pnpm tsx benchmarks/file.bench.ts --save        # save baseline
 *   pnpm tsx benchmarks/file.bench.ts --compare     # compare against baseline
 *   pnpm tsx benchmarks/file.bench.ts --quick       # faster iteration
 *
 * Matching is case-insensitive substring against the suite name.
 */
export async function runSuites(title: string, suites: Suite[], benchFile?: string) {
	const flags = parseFlags(process.argv.slice(2))

	if (flags.quick) {
		benchConfig = { time: 500, warmupTime: 100 }
	}

	const filters = flags.filters.map((f) => f.toLowerCase())

	const selected =
		filters.length === 0
			? suites
			: suites.filter((s) => filters.some((f) => s.name.toLowerCase().includes(f)))

	if (selected.length === 0) {
		console.log(`No suites matched: ${filters.join(', ')}`)
		console.log('Available suites:')

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

	if (flags.quick) {
		console.log('  (quick mode: reduced time & warmup)')
	}

	if (flags.mode === 'save') {
		console.log('  (saving baseline)')
	} else if (flags.mode === 'compare') {
		console.log('  (comparing against baseline)')
	}

	console.log('='.repeat(70))

	const allResults: SuiteResults[] = []

	for (const suite of selected) {
		const result = await suite.fn()

		if (flags.mode !== 'normal' && result) {
			const collected = collectResults(result, suite.name, suite.sectionTitles)

			allResults.push(collected)
		}
	}

	// Handle save/compare modes
	const fileId = benchFile ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-')

	if (flags.mode === 'save') {
		const baselinePath = getBaselinePath(fileId)

		const data: BaselineData = {
			title,
			suites: allResults,
			meta: { timestamp: new Date().toISOString() },
		}

		saveBaseline(baselinePath, data)
		
		console.log(`\nBaseline saved to ${baselinePath}`)
	} else if (flags.mode === 'compare') {
		const baselinePath = getBaselinePath(fileId)

		const baseline = loadBaseline(baselinePath)

		console.log('='.repeat(70))
		console.log(`  A/B Comparison: ${title}`)
		console.log(`  Baseline: ${baseline.meta.timestamp}`)
		console.log('='.repeat(70))

		printComparison(baseline.suites, allResults)
	}

	console.log('='.repeat(70))
	console.log('  Done.')
	console.log('='.repeat(70))
}
