import { FlowRunner } from '../engine/flowRunner'
import { ModelConfig } from '../types/flow'

// This boundary accepts text only. IDs, source metadata and labels never enter a flow.
export function auditFlow(input: string, prompt: string, modelConfig: ModelConfig) {
  return { id: 'extraction-audit', name: 'Extraction audit', initialInput: input, steps: [{ id: 'extract', name: 'extract', prompt, modelConfig, status: 'idle' as const, output: '' }] }
}
export async function inferAudit(input: string, prompt: string, modelConfig: ModelConfig, runner = new FlowRunner()) {
  const result = await runner.runFlow(auditFlow(input, prompt, modelConfig))
  const step = result.flow.steps[0]
  return { output: step.output, error: step.error ?? null, latencyMs: step.latencyMs ?? null }
}
