import { ModelConfig, ModelProvider } from '../types/flow';
import { Sliders, Cpu, Server } from 'lucide-react';

interface EndpointSettingsProps {
  index: number;
  config: ModelConfig;
  onChange: (updatedConfig: ModelConfig) => void;
  disabled?: boolean;
}

export const EndpointSettings: React.FC<EndpointSettingsProps> = ({
  index,
  config,
  onChange,
  disabled = false,
}) => {
  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provider = e.target.value as ModelProvider;
    let defaultModel = config.model;
    if (provider === 'mock') defaultModel = 'mock-default';
    else if (provider === 'ollama') defaultModel = 'llama3';
    else if (provider === 'openai') defaultModel = 'gpt-3.5-turbo';

    onChange({
      ...config,
      provider,
      model: defaultModel,
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

  return (
    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
        <Sliders className="w-3.5 h-3.5 text-indigo-400" />
        <span>Endpoint & Model Settings</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Provider Select */}
        <div className="space-y-1">
          <label className="text-xs text-slate-400 flex items-center gap-1 font-medium">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            Provider
          </label>
          <select
            data-testid={`step-provider-select-${index}`}
            value={config.provider || 'mock'}
            onChange={handleProviderChange}
            disabled={disabled}
            className="w-full h-11 min-h-[44px] bg-slate-900 border border-slate-800 rounded-lg px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="mock">Mock Endpoint</option>
            <option value="ollama">Ollama (Local REST)</option>
            <option value="openai">OpenAI API</option>
          </select>
        </div>

        {/* Model Input (MUST BE <input type="text"> for Playwright .fill()) */}
        <div className="space-y-1">
          <label className="text-xs text-slate-400 flex items-center gap-1 font-medium">
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            Model Identifier
          </label>
          <input
            type="text"
            data-testid={`step-model-select-${index}`}
            value={config.model || ''}
            onChange={handleModelChange}
            disabled={disabled}
            placeholder="e.g. mock-gpt-4o, llama3, gpt-4"
            className="w-full h-11 min-h-[44px] bg-slate-900 border border-slate-800 rounded-lg px-3 text-sm text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Temperature Slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs text-slate-400 font-medium">
            <span>Temperature</span>
            <span className="font-mono text-indigo-400">{(config.temperature ?? 0.7).toFixed(1)}</span>
          </div>
          <div className="h-11 min-h-[44px] flex items-center">
            <input
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
    </div>
  );
};
