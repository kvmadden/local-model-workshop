import { it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { scoreLegacy } from './legacyScore'

it('reproduces every archived v1 case verdict without changing old evidence', () => {
  const root = 'eval/results/archive/schema-v1'
  for (const run of ['2026-10-30-run1', '2026-10-30-run2']) {
    for (const name of readdirSync(`${root}/${run}`).filter(n => n.startsWith('raw-'))) {
      const rows = readFileSync(`${root}/${run}/${name}`, 'utf8').trim().split('\n').map(line => JSON.parse(line))
      for (const row of rows) expect(scoreLegacy(row.gold, row.output).allCorrect).toBe(row.score.allCorrect)
    }
  }
})
