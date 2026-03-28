import { state, withHistory } from '../../src/index.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. Write overhead: plain vs history
// ---------------------------------------------------------------------------

const writeOverheadSuite = defineSuite('history-write', {
	'History Write Overhead': (bench) => {
		const hPlain = state(uniqueKey('hist-plain'), { default: 0 })

		hPlain.subscribe(() => {})

		let ipw = 0

		bench.add('write (no history)', () => {
			hPlain.set(++ipw)
		})

		const hTracked = withHistory(state(uniqueKey('hist-tracked'), { default: 0 }))

		hTracked.subscribe(() => {})

		let iht = 0

		bench.add('write (with history)', () => {
			hTracked.set(++iht)
		})

		// History with small maxSize
		const hSmall = withHistory(state(uniqueKey('hist-small'), { default: 0 }), { maxSize: 10 })

		hSmall.subscribe(() => {})

		for (let i = 0; i < 10; i++) hSmall.set(i)

		let ism = 10

		bench.add('write (history maxSize=10, at capacity)', () => {
			hSmall.set(++ism)
		})

		// History with large maxSize
		const hLarge = withHistory(state(uniqueKey('hist-large'), { default: 0 }), { maxSize: 500 })

		hLarge.subscribe(() => {})

		for (let i = 0; i < 500; i++) hLarge.set(i)

		let ilg = 500

		bench.add('write (history maxSize=500, at capacity)', () => {
			hLarge.set(++ilg)
		})
	},
})

// ---------------------------------------------------------------------------
// 2. Undo/redo cycles
// ---------------------------------------------------------------------------

const undoRedoSuite = defineSuite('history-undo-redo', {
	'Undo/Redo Cycles': (bench) => {
		const hCycle = withHistory(state(uniqueKey('hist-cycle'), { default: 0 }), { maxSize: 100 })

		for (let i = 0; i < 50; i++) hCycle.set(i)

		bench.add('undo + redo cycle', () => {
			hCycle.undo()
			hCycle.redo()
		})

		// Rapid undo (10 in a row)
		const hUndo = withHistory(state(uniqueKey('hist-undo10'), { default: 0 }), { maxSize: 100 })

		for (let i = 0; i < 50; i++) hUndo.set(i)

		bench.add('10x undo', () => {
			for (let i = 0; i < 10; i++) hUndo.undo()

			// Redo to restore for next iteration
			for (let i = 0; i < 10; i++) hUndo.redo()
		})

		// clearHistory
		const hClear = withHistory(state(uniqueKey('hist-clear'), { default: 0 }), { maxSize: 100 })

		bench.add('write 20 + clearHistory', () => {
			for (let i = 0; i < 20; i++) hClear.set(i)

			hClear.clearHistory()
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: History',
	[writeOverheadSuite, undoRedoSuite],
	'internal/history',
).catch(console.error)
