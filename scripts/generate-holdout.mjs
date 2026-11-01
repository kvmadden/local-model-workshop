// Synthetic challenge set frozen before any new model calls. stdout only.
let state = 20261031
const random = () => {
  state = (Math.imul(1664525, state) + 1013904223) >>> 0
  return state / 2 ** 32
}
const patterns = [
  ['take 2 tablets by mouth tid prn itching', 'three_times_daily', null, true, 'itching', 2],
  ['take half a tablet at bedtime as needed for sleep', 'once_daily', 'bedtime', true, 'sleep', 0.5],
  ['take 1 tablet every 12 hours', 'every_12_hours', null, false, null, 1],
  ['take 1 tablet every morning', 'once_daily', 'morning', false, null, 1],
  ['take 2 tablets twice daily with meals', 'twice_daily', 'with_meals', false, null, 2],
  ['take 1 tablet as needed for nausea', null, null, true, 'nausea', 1],
]
const cases = Array.from({ length: 12 }, (_, i) => {
  const [instruction, frequency, timing, prn, reason, multiplier] = patterns[i % patterns.length]
  const strength = [4, 8, 12, 20][Math.floor(random() * 4)]
  const drug = `fict${['alfa', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima'][i]}`
  const id = `h${String(i + 1).padStart(2, '0')}`
  const dose = strength * multiplier
  return {
    id,
    input: `${drug} ${strength} mg tablets, ${instruction}`,
    tags: ['synthetic', 'fictional-drug', `pattern-${i % patterns.length + 1}`],
    v1: { id, medication: drug, medication_match: drug, dose_value: dose, dose_unit: 'mg', frequency: timing === 'bedtime' ? 'at_bedtime' : frequency ?? 'as_needed' },
    v2: { id, drug, drug_match: drug, dose_per_administration: { value: dose, unit: 'mg' }, frequency, timing, prn, prn_indication: reason },
  }
})
process.stdout.write(JSON.stringify({ seed: 20261031, protocol: 'No tuning. Run archived v1 and unchanged v2 prompts once per model. Report all misses. Gold is generated from six templates, not independently pharmacist reviewed.', cases }, null, 2) + '\n')
