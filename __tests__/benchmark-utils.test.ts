import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Bench } from 'tinybench'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	type BaselineData,
	collectResults,
	getBaselinePath,
	loadBaseline,
	parseFlags,
	printComparison,
	type SuiteResults,
	saveBaseline,
} from '../benchmarks/ab.js'

// ---------------------------------------------------------------------------
// parseFlags
// ---------------------------------------------------------------------------

describe('parseFlags', () => {
	it('returns normal mode with no flags', () => {
		const result = parseFlags([])

		expect(result).toEqual({ mode: 'normal', quick: false, filters: [] })
	})

	it('parses --save flag', () => {
		const result = parseFlags(['--save'])

		expect(result).toEqual({ mode: 'save', quick: false, filters: [] })
	})

	it('parses --compare flag', () => {
		const result = parseFlags(['--compare'])

		expect(result).toEqual({ mode: 'compare', quick: false, filters: [] })
	})

	it('parses --quick flag', () => {
		const result = parseFlags(['--quick'])

		expect(result).toEqual({ mode: 'normal', quick: true, filters: [] })
	})

	it('parses mixed flags and filters', () => {
		const result = parseFlags(['--save', 'lifecycle', 'batch-scaling', '--quick'])

		expect(result).toEqual({
			mode: 'save',
			quick: true,
			filters: ['lifecycle', 'batch-scaling'],
		})
	})

	it('passes non-flag args as filters', () => {
		const result = parseFlags(['diamond', 'watch'])

		expect(result).toEqual({ mode: 'normal', quick: false, filters: ['diamond', 'watch'] })
	})
})

// ---------------------------------------------------------------------------
// collectResults
// ---------------------------------------------------------------------------

describe('collectResults', () => {
	it('extracts structured data from Bench instances', async () => {
		const bench = new Bench({ time: 100, warmupTime: 50 })

		bench.add('task-a', () => {
			Math.sqrt(42)
		})

		bench.add('task-b', () => {
			Math.sqrt(7)
		})

		await bench.run()

		const results = collectResults([bench], 'test-suite', ['Test Section'])

		expect(results.suite).toBe('test-suite')
		expect(results.sections).toHaveLength(1)

		const section = results.sections[0]

		expect(section).not.toBeUndefined()

		if (!section) return

		expect(section.title).toBe('Test Section')
		expect(section.tasks).toHaveLength(2)

		for (const task of section.tasks) {
			expect(task.name).not.toBeUndefined()
			expect(typeof task.hz).toBe('number')
			expect(task.hz).toBeGreaterThan(0)
			expect(typeof task.mean).toBe('number')
			expect(typeof task.p99).toBe('number')
		}
	})

	it('handles multiple bench instances', async () => {
		const bench1 = new Bench({ time: 100, warmupTime: 50 })

		bench1.add('fast', () => {
			Math.sqrt(42)
		})

		const bench2 = new Bench({ time: 100, warmupTime: 50 })

		bench2.add('slow', () => {
			Math.sqrt(7)
		})

		await bench1.run()
		await bench2.run()

		const results = collectResults([bench1, bench2], 'multi', ['Section 1', 'Section 2'])

		expect(results.sections).toHaveLength(2)
		expect(results.sections[0]?.title).toBe('Section 1')
		expect(results.sections[1]?.title).toBe('Section 2')
		expect(results.sections[0]?.tasks).toHaveLength(1)
		expect(results.sections[1]?.tasks).toHaveLength(1)
	})
})

// ---------------------------------------------------------------------------
// saveBaseline / loadBaseline round-trip
// ---------------------------------------------------------------------------

describe('saveBaseline / loadBaseline', () => {
	const tmpDir = join(tmpdir(), 'gjendje-ab-test')

	const tmpFile = join(tmpDir, 'test-baseline.json')

	beforeEach(() => {
		mkdirSync(tmpDir, { recursive: true })
	})

	afterEach(() => {
		if (existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true })
		}
	})

	it('round-trips baseline data', () => {
		const data: BaselineData = {
			title: 'Test Benchmark',
			suites: [
				{
					suite: 'test',
					sections: [
						{
							title: 'Section A',
							tasks: [
								{ name: 'task-1', hz: 1000000, mean: 0.001, p99: 0.002 },
								{ name: 'task-2', hz: 500000, mean: 0.002, p99: 0.004 },
							],
						},
					],
				},
			],
			meta: { timestamp: '2026-03-24T10:00:00.000Z' },
		}

		saveBaseline(tmpFile, data)

		expect(existsSync(tmpFile)).toBe(true)

		const loaded = loadBaseline(tmpFile)

		expect(loaded).toEqual(data)
	})

	it('creates directories recursively', () => {
		const nestedFile = join(tmpDir, 'deep', 'nested', 'baseline.json')

		const data: BaselineData = {
			title: 'Test',
			suites: [],
			meta: { timestamp: '' },
		}

		saveBaseline(nestedFile, data)

		expect(existsSync(nestedFile)).toBe(true)
	})

	it('throws clear error when baseline file is missing', () => {
		expect(() => loadBaseline(join(tmpDir, 'nonexistent.json'))).toThrow(/No baseline found/)

		expect(() => loadBaseline(join(tmpDir, 'nonexistent.json'))).toThrow(/Run with --save first/)
	})
})

// ---------------------------------------------------------------------------
// getBaselinePath
// ---------------------------------------------------------------------------

describe('getBaselinePath', () => {
	it('returns path under .baseline directory', () => {
		const path = getBaselinePath('internal')

		expect(path).toContain('.baseline')
		expect(path).toContain('internal.json')
	})
})

// ---------------------------------------------------------------------------
// printComparison
// ---------------------------------------------------------------------------

describe('printComparison', () => {
	it('prints comparison output with improvements and regressions', () => {
		const logs: string[] = []

		const originalLog = console.log

		console.log = (...args: unknown[]) => {
			logs.push(args.map(String).join(' '))
		}

		const baseline: SuiteResults[] = [
			{
				suite: 'test',
				sections: [
					{
						title: 'Section',
						tasks: [
							{ name: 'fast-task', hz: 1000000, mean: 0.001, p99: 0.002 },
							{ name: 'slow-task', hz: 100000, mean: 0.01, p99: 0.02 },
							{ name: 'stable-task', hz: 500000, mean: 0.002, p99: 0.004 },
						],
					},
				],
			},
		]

		const current: SuiteResults[] = [
			{
				suite: 'test',
				sections: [
					{
						title: 'Section',
						tasks: [
							{ name: 'fast-task', hz: 1200000, mean: 0.0008, p99: 0.0015 },
							{ name: 'slow-task', hz: 80000, mean: 0.0125, p99: 0.025 },
							{ name: 'stable-task', hz: 510000, mean: 0.00196, p99: 0.0039 },
						],
					},
				],
			},
		]

		printComparison(baseline, current)

		console.log = originalLog

		const output = logs.join('\n')

		// fast-task improved by 20%
		expect(output).toContain('▲')
		expect(output).toContain('+20.0%')

		// slow-task regressed by 20%
		expect(output).toContain('▼')
		expect(output).toContain('-20.0%')

		// stable-task within threshold (2% change)
		expect(output).toContain('+2.0%')

		// Summary line
		expect(output).toContain('1 improved')
		expect(output).toContain('1 regressed')
		expect(output).toContain('1 unchanged')
	})

	it('handles new tasks not in baseline', () => {
		const logs: string[] = []

		const originalLog = console.log

		console.log = (...args: unknown[]) => {
			logs.push(args.map(String).join(' '))
		}

		const baseline: SuiteResults[] = [
			{
				suite: 'test',
				sections: [{ title: 'Section', tasks: [] }],
			},
		]

		const current: SuiteResults[] = [
			{
				suite: 'test',
				sections: [
					{
						title: 'Section',
						tasks: [{ name: 'new-task', hz: 1000000, mean: 0.001, p99: 0.002 }],
					},
				],
			},
		]

		printComparison(baseline, current)

		console.log = originalLog

		const output = logs.join('\n')

		expect(output).toContain('new-task')
		expect(output).toContain('(new)')
	})

	it('handles removed tasks from baseline', () => {
		const logs: string[] = []

		const originalLog = console.log

		console.log = (...args: unknown[]) => {
			logs.push(args.map(String).join(' '))
		}

		const baseline: SuiteResults[] = [
			{
				suite: 'test',
				sections: [
					{
						title: 'Section',
						tasks: [{ name: 'removed-task', hz: 1000000, mean: 0.001, p99: 0.002 }],
					},
				],
			},
		]

		const current: SuiteResults[] = [
			{
				suite: 'test',
				sections: [{ title: 'Section', tasks: [] }],
			},
		]

		printComparison(baseline, current)

		console.log = originalLog

		const output = logs.join('\n')

		expect(output).toContain('removed-task')
		expect(output).toContain('(removed)')
	})
})
