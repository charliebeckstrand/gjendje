import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Bench } from 'tinybench'
import { formatOps } from './helpers.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BenchResult = {
	name: string
	hz: number
	mean: number
	p99: number
}

export type SectionResults = {
	title: string
	tasks: BenchResult[]
}

export type SuiteResults = {
	suite: string
	sections: SectionResults[]
}

export type BaselineData = {
	title: string
	suites: SuiteResults[]
	meta: { timestamp: string }
}

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------

export type ParsedFlags = {
	mode: 'normal' | 'save' | 'compare'
	quick: boolean
	filters: string[]
}

export function parseFlags(argv: string[]): ParsedFlags {
	let mode: ParsedFlags['mode'] = 'normal'

	let quick = false

	const filters: string[] = []

	for (const arg of argv) {
		if (arg === '--save') {
			mode = 'save'
		} else if (arg === '--compare') {
			mode = 'compare'
		} else if (arg === '--quick') {
			quick = true
		} else {
			filters.push(arg)
		}
	}

	return { mode, quick, filters }
}

// ---------------------------------------------------------------------------
// Result collection
// ---------------------------------------------------------------------------

export function collectResults(
	benches: Bench[],
	suiteName: string,
	sectionTitles: string[],
): SuiteResults {
	const sections: SectionResults[] = []

	for (let i = 0; i < benches.length; i++) {
		const bench = benches[i]

		const title = sectionTitles[i] ?? `Section ${i + 1}`

		if (!bench) continue

		const tasks: BenchResult[] = bench.tasks.map((t) => {
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

		sections.push({ title, tasks })
	}

	return { suite: suiteName, sections }
}

// ---------------------------------------------------------------------------
// Baseline persistence
// ---------------------------------------------------------------------------

export function getBaselinePath(benchFile: string): string {
	return resolve('benchmarks', '.baseline', `${benchFile}.json`)
}

export function saveBaseline(filePath: string, data: BaselineData): void {
	const dir = dirname(filePath)

	mkdirSync(dir, { recursive: true })
	writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export function loadBaseline(filePath: string): BaselineData {
	if (!existsSync(filePath)) {
		throw new Error(
			`No baseline found at ${filePath}\nRun with --save first to create a baseline.`,
		)
	}

	const raw = readFileSync(filePath, 'utf-8')

	return JSON.parse(raw) as BaselineData
}

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const ANSI = {
	green: '\x1b[32m',
	red: '\x1b[31m',
	dim: '\x1b[2m',
	bold: '\x1b[1m',
	reset: '\x1b[0m',
}

// ---------------------------------------------------------------------------
// Comparison output
// ---------------------------------------------------------------------------

const THRESHOLD = 5

export function printComparison(baseline: SuiteResults[], current: SuiteResults[]): void {
	const baselineMap = new Map<string, Map<string, BenchResult>>()

	for (const suite of baseline) {
		for (const section of suite.sections) {
			const taskMap = new Map<string, BenchResult>()

			for (const task of section.tasks) {
				taskMap.set(task.name, task)
			}

			baselineMap.set(`${suite.suite}::${section.title}`, taskMap)
		}
	}

	let improved = 0

	let regressed = 0

	let unchanged = 0

	for (const suite of current) {
		for (const section of suite.sections) {
			const key = `${suite.suite}::${section.title}`

			const baselineTasks = baselineMap.get(key)

			console.log(`\n── ${section.title} ──\n`)
			console.log(
				`  ${'Task'.padEnd(40)} ${'Baseline'.padStart(16)}  ${'Current'.padStart(16)}  ${'Change'.padStart(10)}`,
			)
			console.log(`  ${'─'.repeat(86)}`)

			for (const task of section.tasks) {
				const base = baselineTasks?.get(task.name)

				if (!base) {
					console.log(
						`  ${task.name.padEnd(40)} ${'(new)'.padStart(16)}  ${formatOps(task.hz).padStart(16)}`,
					)
					continue
				}

				const pctChange = base.hz > 0 ? ((task.hz - base.hz) / base.hz) * 100 : 0

				const absPct = Math.abs(pctChange)

				let changeStr: string

				let color: string

				if (absPct <= THRESHOLD) {
					changeStr = `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%`
					color = ANSI.dim
					unchanged++
				} else if (pctChange > 0) {
					changeStr = `▲ +${pctChange.toFixed(1)}%`
					color = ANSI.green
					improved++
				} else {
					changeStr = `▼ ${pctChange.toFixed(1)}%`
					color = ANSI.red
					regressed++
				}

				console.log(
					`  ${task.name.padEnd(40)} ${formatOps(base.hz).padStart(16)}  ${formatOps(task.hz).padStart(16)}  ${color}${changeStr.padStart(10)}${ANSI.reset}`,
				)
			}

			// Show tasks that were in baseline but not in current
			if (baselineTasks) {
				const currentNames = new Set(section.tasks.map((t) => t.name))

				for (const [name, base] of baselineTasks) {
					if (!currentNames.has(name)) {
						console.log(
							`  ${name.padEnd(40)} ${formatOps(base.hz).padStart(16)}  ${'(removed)'.padStart(16)}`,
						)
					}
				}
			}
		}
	}

	console.log('')
	console.log(
		`  ${ANSI.bold}Summary:${ANSI.reset} ${ANSI.green}${improved} improved${ANSI.reset}  |  ${ANSI.red}${regressed} regressed${ANSI.reset}  |  ${ANSI.dim}${unchanged} unchanged (±${THRESHOLD}% threshold)${ANSI.reset}`,
	)
}
