import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { scoreCase } from './sigScore'

const read = (file: string) => readFileSync(file, 'utf8')

describe('frozen synthetic holdout', () => {
  it('reproduces the committed freeze from its seed without writing files', () => {
    const generated = execFileSync(process.execPath, ['scripts/generate-holdout.mjs'], { encoding: 'utf8' })
    expect(generated).toBe(read('eval/heldout/frozen.json'))
  })
  it('has disjoint inputs and ids, and internally consistent v2 gold', () => {
    const frozen = JSON.parse(read('eval/heldout/frozen.json'))
    const old = read('eval/sig-extraction/cases.jsonl').trim().split('\n').map(line => JSON.parse(line))
    expect(frozen.seed).toBe(20261031)
    expect(frozen.cases).toHaveLength(12)
    for (const c of frozen.cases) {
      expect(old.some(o => o.id === c.id || o.input === c.input)).toBe(false)
      expect(scoreCase(c.v2, JSON.stringify(c.v2)).allCorrect).toBe(true)
      expect(c.v1.dose_value).toBe(c.v2.dose_per_administration.value)
    }
  })
})
