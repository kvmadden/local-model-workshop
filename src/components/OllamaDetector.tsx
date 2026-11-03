import React, { useState } from 'react';
import { RefreshCw, CheckCircle2, XCircle, HardDrive, Loader2, Copy, Check } from 'lucide-react';
import { useOllamaStatus, formatModelSize } from '../hooks/useOllamaStatus';
import { MODELS_DATA } from '../data/models';
import { MISMATCH_LABEL } from '../utils/modelUtils';

export const OllamaDetector: React.FC = () => {
  const { available, models, loading, refresh, resolveModel, reason } = useOllamaStatus();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (cmd: string, id: string) => {
    navigator.clipboard?.writeText(cmd);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div
      data-testid="ollama-detector"
      className={`border rounded-2xl p-5 shadow-xl space-y-4 transition-colors ${
        available
          ? 'bg-emerald-950/30 border-emerald-800/60'
          : 'bg-slate-900 border-slate-800'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {loading ? (
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          ) : available ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <XCircle className="w-5 h-5 text-slate-400" />
          )}
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              {loading
                ? 'Checking for local models…'
                : available
                  ? 'Ollama is running on your Mac'
                  : 'Ollama not reached'}
            </h3>
            <p className="text-xs text-slate-400">
              {available
                ? `${models.length} model${models.length !== 1 ? 's' : ''} installed locally`
                : `No reply from localhost:11434 (${reason ?? 'unknown reason'}). Ollama may be stopped, still starting, busy or blocking this page, or it may not be installed.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          data-testid="ollama-refresh-btn"
          onClick={() => refresh()}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Installed Models Grid */}
      {available && models.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Installed Models:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {models.map((model) => (
              <div
                key={model.name}
                data-testid={`ollama-model-${model.name}`}
                className="flex items-center justify-between p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <HardDrive className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-200 truncate">{model.name}</div>
                    {model.size > 0 && (
                      <div className="text-[10px] text-slate-400">{formatModelSize(model.size)}</div>
                    )}
                  </div>
                </div>
                <span
                  data-testid={`detector-installed-tag-${model.name}`}
                  className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60 shrink-0"
                >
                  🟢 Installed in Ollama
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model Catalog Availability & Quick Pull List */}
      <div className="space-y-2 pt-2 border-t border-slate-800/80">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Curated Model Catalog Status:
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {MODELS_DATA.map((catModel) => {
            // Exact version or nothing — see the matching note in ModelCatalog.
            const resolution = resolveModel(catModel.name);
            const installedTag = resolution?.exact ? resolution.tag : null;
            const otherBuild = resolution && !resolution.exact ? resolution : null;
            const pullCmd = catModel.ollamaPull;

            return (
              <div
                key={catModel.id}
                data-testid={`detector-catalog-status-${catModel.id}`}
                className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 text-xs gap-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-200 truncate">{catModel.name}</div>
                  <div className="text-[10px] text-slate-400">{catModel.parameters} • {catModel.family}</div>
                  {otherBuild && (
                    <div
                      data-testid={`detector-other-version-${catModel.id}`}
                      className="text-[10px] text-amber-400 truncate"
                      title={`${otherBuild.tag} is installed, but this row is ${catModel.name}.`}
                    >
                      <span className="font-mono">{otherBuild.tag}</span> installed —{' '}
                      {MISMATCH_LABEL[otherBuild.mismatch]}
                    </div>
                  )}
                </div>

                {installedTag ? (
                  <span
                    data-testid={`status-badge-installed-${catModel.id}`}
                    className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded shrink-0"
                  >
                    🟢 Installed in Ollama
                  </span>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      data-testid={`status-badge-available-${catModel.id}`}
                      className="text-[10px] font-semibold text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded"
                    >
                      {pullCmd ? '⚪ Available via Ollama' : '⚪ Not served by Ollama'}
                    </span>
                    {!pullCmd && (
                      <span
                        data-testid={`no-ollama-path-detector-${catModel.id}`}
                        className="text-[10px] text-slate-300 max-w-[14rem] text-right"
                      >
                        Set up through {catModel.appPairing}
                      </span>
                    )}
                    {pullCmd && <button
                      type="button"
                      data-testid={`copy-pull-detector-${catModel.id}`}
                      onClick={() => handleCopy(pullCmd, catModel.id)}
                      className="text-[10px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-700 text-indigo-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer min-h-[44px] min-w-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      title={`Copy command: ${pullCmd}`}
                    >
                      {copiedId === catModel.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-indigo-400" />
                      )}
                    </button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!available && !loading && (
        <a
          href="https://ollama.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Download Ollama →
        </a>
      )}
    </div>
  );
};
