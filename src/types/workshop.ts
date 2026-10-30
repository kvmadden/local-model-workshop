export type TabType = 'wizard' | 'catalog' | 'studio' | 'hardware' | 'shortcuts' | 'benchmark' | 'builder';

export interface TaskOption {
  id: string;
  title: string;
  category: string;
  description: string;
  recommendedModel: string;
  recommendedApp: 'LM Studio' | 'MacWhisper' | 'AnythingLLM' | 'Ollama';
  appUrl: string;
  appIconName: string;
  setupSteps: string[];
  sampleWorkflow: string;
}

export interface ModelCardData {
  id: string;
  name: string;
  /**
   * The exact `ollama pull` command for THIS entry, carried as data because
   * deriving it from the family name hands a Llama 4 card the Llama 3.2
   * command. Empty-string is not a valid value.
   *
   * `null` means Ollama does not serve this model at all, so no pull command
   * exists to offer: the Ollama library has pages for `llama3.2`, `qwen2.5`,
   * `deepseek-r1` and `phi3.5`, and none for `whisper`. Both catalog surfaces render the entry's own
   * `appPairing` setup path instead of a pull button when this is `null`,
   * because a copy-to-clipboard command that 404s in the user's terminal is
   * worse than no command at all.
   */
  ollamaPull: string | null;
  family: string;
  parameters: string;
  macRamRequired: string;
  appleSiliconScore: string;
  recommendedFor: string[];
  setupSteps: string[];
  description: string;
  appPairing: string;
  appUrl: string;
  license: string;
}

export interface UseCaseSampleInput {
  id: string;
  label: string;
  content: string;
}

export interface UseCaseData {
  id: 'transcription' | 'summarizing' | 'dictation' | 'file-chat';
  title: string;
  subtitle: string;
  description: string;
  recommendedModel: string;
  recommendedApp: string;
  sampleInputs: UseCaseSampleInput[];
  defaultOutput: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface OllamaStatus {
  available: boolean;
  models: OllamaModel[];
  loading: boolean;
}
