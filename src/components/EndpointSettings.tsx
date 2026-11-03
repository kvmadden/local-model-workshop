import { ModelConfig, ModelProvider } from '../types/flow';
import { Sliders, Cpu, Server, Link } from 'lucide-react';
import { isLoopbackUrl } from '../engine/modelAdapter';

interface EndpointSettingsProps {
  index: number;
  config: ModelConfig;
  onChange: (updatedConfig: ModelConfig) => void;
  disabled?: boolean;
}

/** Where each provider sends the prompt when the step does not say otherwise. Both are this Mac. */
export const DEFAULT_ENDPOINTS: Partial<Record<ModelProvider, string>> = {
  ollama: 'http://localhost:11434/api/generate',
  openai: 'http://127.0.0.1:1234/v1/chat/completions',
};

const inputClass =
  'w-full h-11 min-h-[44px] bg-slate-900 border border-slate-800 rounded-lg px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed';

export const EndpointSettings: React.FC<EndpointSettingsProps> = ({
  index,
  config,
  onChange,
  disabled = false,
}) => {
  const ids = {
    provider: `step-${index}-provider`,
    model: `step-${index}-model`,
    temperature: `step-${index}-temperature`,
    endpoint: `step-${index}-endpoint`,
    endpointNote: `step-${index}-endpoint-note`,
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provider = e.target.value as ModelProvider;
    let defaultModel = config.model;
    if (provider === 'mock') defaultModel = 'mock-default';
    else if (provider === 'ollama') defaultModel = 'llama3';
    else if (provider === 'openai') defaultModel = 'local-model';

    onChange({
      ...config,
      provider,
      model: defaultModel,
      endpointUrl: DEFAULT_ENDPOINTS[provider],
    });
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...config,
      model: e.target.value,
    });
  };

  const handleTempChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...config,
      temperature: parseFloat(e.target.value),
    });
  };

  const handleEndpointChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...config,
      endpointUrl: e.target.value,
    });
  };

  const provider = config.provider || 'mock';
  const endpoint = config.endpointUrl || DEFAULT_ENDPOINTS[provider] || '';
  const endpointIsLocal = isLoopbackUrl(endpoint);

  return (
    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <Sliders className="w-3.5 h-3.5 text-indigo-400" />
        <span>Endpoint & Model Settings</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Provider Select */}
        <div className="space-y-1">
          <label htmlFor={ids.provider} className="text-xs text-slate-400 flex items-center gap-1 font-medium">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            Provider
          </label>
          <select
            id={ids.provider}
            data-testid={`step-provider-select-${index}`}
            value={provider}
            onChange={handleProviderChange}
            disabled={disabled}
            className={inputClass}
          >
            <option value="mock">Mock Endpoint</option>
            <option value="ollama">Ollama (Local REST)</option>
            <option value="openai">OpenAI-compatible server on this Mac</option>
          </select>
        </div>

        {/* Model Input (MUST BE <input type="text"> for Playwright .fill()) */}
        <div className="space-y-1">
          <label htmlFor={ids.model} className="text-xs text-slate-400 flex items-center gap-1 font-medium">
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            Model Identifier
          </label>
          <input
            id={ids.model}
            type="text"
            data-testid={`step-model-select-${index}`}
            value={config.model || ''}
            onChange={handleModelChange}
            disabled={disabled}
            placeholder="e.g. mock-gpt-4o, llama3, gpt-4"
            className={`${inputClass} font-mono`}
          />
        </div>

        {/* Temperature Slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs text-slate-400 font-medium">
            <label htmlFor={ids.temperature}>Temperature</label>
            <span className="text-indigo-400">{(config.temperature ?? 0.7).toFixed(1)}</span>
          </div>
          <div className="h-11 min-h-[44px] flex items-center">
            <input
              id={ids.temperature}
              type="range"
              data-testid={`step-temp-slider-${index}`}
              min="0"
              max="1"
              step="0.1"
              value={config.temperature ?? 0.7}
              onChange={handleTempChange}
              disabled={disabled}
              className="w-full accent-indigo-500 bg-slate-800 h-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {provider !== 'mock' && (
        <div className="space-y-1">
          <label htmlFor={ids.endpoint} className="text-xs text-slate-400 flex items-center gap-1 font-medium">
            <Link className="w-3.5 h-3.5 text-slate-400" />
            Endpoint URL
          </label>
          <input
            id={ids.endpoint}
            type="text"
            data-testid={`step-endpoint-input-${index}`}
            value={endpoint}
            onChange={handleEndpointChange}
            disabled={disabled}
            aria-describedby={ids.endpointNote}
            className={`${inputClass} font-mono`}
          />
          <p
            id={ids.endpointNote}
            data-testid={`step-endpoint-note-${index}`}
            className={`text-xs ${endpointIsLocal ? 'text-slate-400' : 'text-amber-400'}`}
          >
            {endpointIsLocal
              ? 'This address is on this Mac. The prompt goes only to that server.'
              : 'This address is not this Mac. The workshop refuses to send prompt text there.'}
          </p>
        </div>
      )}
    </div>
  );
};
