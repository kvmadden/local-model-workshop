import { parsePrediction, scoreCase, SigGold } from './sigScore'

export interface LegacyGold {
  id: string
  medication: string
  medication_match: string
  dose_value: number
  dose_unit: string
  frequency: string
}

// Reuse the current scorer's name, dose and label rules for the three v1 fields.
// No credit is inferred for timing or PRN, which v1 could not represent.
export function scoreLegacy(gold: LegacyGold, output: string) {
  const p = parsePrediction(output) as Record<string, unknown> | null
  const projected: SigGold = {
    id: gold.id, drug: gold.medication, drug_match: gold.medication_match,
    dose_per_administration: { value: gold.dose_value, unit: gold.dose_unit },
    frequency: gold.frequency, timing: null, prn: false, prn_indication: null,
  }
  const mapped = p ? JSON.stringify({ drug: p.medication, dose_per_administration: { value: p.dose_value, unit: p.dose_unit }, frequency: p.frequency }) : output
  const score = scoreCase(projected, mapped)
  return { ...score, allCorrect: score.drug && score.dose && score.frequency }
}
