/**
 * Core type definitions for the linear model flow execution engine.
 */

/**
 * Supported LLM model provider backends.
 */
export type ModelProvider = 'mock' | 'ollama' | 'openai';

/**
 * Status of an individual execution step within a flow.
 */
export type StepStatus = 'idle' | 'running' | 'completed' | 'error';

/**
 * Overall status of a linear flow execution.
 */
export type ExecutionStatus = 'idle' | 'running' | 'completed' | 'error';

/**
 * Configuration options for model endpoint execution.
 */
export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  endpointUrl?: string;
  mockPattern?: 'echo' | 'template' | 'custom';
  mockLatencyMs?: number;
  mockCustomResponse?: string;
  systemPrompt?: string;
  /**
   * Ollama only. Output constraint passed through as the `format` field:
   * `'json'` or a JSON Schema object. Omitted from the request when unset.
   */
  format?: 'json' | Record<string, unknown>;
  /**
   * Ollama only. Reasoning control passed through as the `think` field.
   * Most thinking models accept a boolean; gpt-oss takes 'low' | 'medium' | 'high'.
   * Omitted from the request when unset.
   */
  think?: boolean | 'low' | 'medium' | 'high';
  /** Abort the request after this many milliseconds. Defaults to 120000. */
  timeoutMs?: number;
  /** Sampling seed, sent to Ollama as options.seed. */
  seed?: number;
  /** Context window, sent to Ollama as options.num_ctx. */
  numCtx?: number;
  /**
   * OpenAI-compatible only. Text is sent to a host other than this machine only when this is
   * true and an API key is set. Without both, the request is refused before anything is sent.
   */
  allowRemote?: boolean;
}

/**
 * Defines a single step in a linear flow.
 */
export interface Step {
  id: string;
  name: string;
  prompt: string;
  modelConfig: ModelConfig;
  status: StepStatus;
  output: string;
  error?: string;
  latencyMs?: number;
  /** Placeholders in the prompt that had no value when the step last ran. */
  warnings?: string[];
}

/**
 * Definition of a linear model flow containing ordered steps and initial input.
 */
export interface Flow {
  id: string;
  name: string;
  steps: Step[];
  initialInput: string;
}

/**
 * Execution result for an individual step recorded in execution state.
 */
export interface StepExecutionResult {
  stepId: string;
  stepName: string;
  status: StepStatus;
  output: string;
  error?: string;
  latencyMs?: number;
  warnings?: string[];
  /** Provider timing and token counts, when the provider reports them. */
  meta?: Record<string, number>;
}

/**
 * Execution state tracking runtime execution of a flow.
 */
export interface ExecutionState {
  flowId: string;
  status: ExecutionStatus;
  currentStepIndex: number;
  context: Record<string, string>;
  stepResults: Record<string, StepExecutionResult>;
  startTime?: number;
  endTime?: number;
  error?: string;
}

/**
 * Standardized model endpoint execution result return type.
 */
export interface ModelExecutionResult {
  text: string;
  /** Wall-clock time from sending the request to having the whole reply body. */
  latencyMs: number;
  error?: string;
  /**
   * Provider-reported numbers when available. For Ollama: total_duration, load_duration,
   * prompt_eval_count, prompt_eval_duration, eval_count and eval_duration (durations in ns).
   */
  meta?: Record<string, number>;
}

/**
 * Interface contract for model endpoint adapters.
 */
export interface ModelEndpointAdapter {
  executePrompt(prompt: string, config: ModelConfig): Promise<ModelExecutionResult>;
}

/**
 * Sensible default configuration for mock model endpoint.
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: 'mock',
  model: 'mock-default',
  temperature: 0.7,
  mockPattern: 'echo',
  mockLatencyMs: 150,
};

/**
 * Factory helper for creating a Step instance.
 */
export function createDefaultStep(id: string, name: string, prompt: string = ''): Step {
  return {
    id,
    name,
    prompt,
    modelConfig: { ...DEFAULT_MODEL_CONFIG },
    status: 'idle',
    output: '',
  };
}

/**
 * Factory helper for creating a Flow instance.
 */
export function createDefaultFlow(id: string, name: string, initialInput: string = ''): Flow {
  return {
    id,
    name,
    steps: [],
    initialInput,
  };
}
