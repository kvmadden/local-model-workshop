import React, { useState, useEffect, useRef } from 'react';
import { MODELS_DATA } from '../data/models';
import { ModelCardData } from '../types/workshop';
import { HardDrive, Zap, CheckCircle, X, AppWindow, ShieldCheck, ExternalLink, Copy, Check } from 'lucide-react';
import { useOllamaStatus } from '../hooks/useOllamaStatus';
import { MISMATCH_LABEL } from '../utils/modelUtils';

export const ModelCatalog: React.FC = () => {
  const [selectedModelForModal, setSelectedModelForModal] = useState<ModelCardData | null>(null);
  const [ramFilter, setRamFilter] = useState<'all' | '8gb' | '16gb'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { resolveModel } = useOllamaStatus();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedModelForModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedModelForModal(null);
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      if (modalRef.current) {
        const first = modalRef.current.querySelector<HTMLElement>('button, [href]');
        first?.focus();
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [selectedModelForModal]);

  const handleCopyPull = (cmd: string, id: string) => {
    navigator.clipboard?.writeText(cmd);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredModels = MODELS_DATA.filter((model) => {
    if (ramFilter === '8gb') return model.macRamRequired.includes('8 GB');
    if (ramFilter === '16gb') return model.macRamRequired.includes('16 GB');
    return true;
  });

  return (
    <div data-testid="model-catalog-container" className="space-y-6">
      {/* Catalog Header */}
      <div className="space-y-5">
        <div className="space-y-3">
          <h2 data-testid="catalog-heading" className="font-display text-[30px] font-semibold leading-[1.1] text-balance text-ink sm:text-[36px]">
            Small local models for a Mac
          </h2>
          <p className="max-w-3xl text-[17px] leading-relaxed text-ink-2">
            Five small language and speech models (1.5B to 8B parameters) with approximate RAM requirements and speed ranges for Apple Silicon Macs. Speed ranges are rough guides, not measurements from this app.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">App Pairings:</span>
            <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-300">Jan (jan.ai)</span>
            <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-300">GPT4All (gpt4all.io)</span>
            <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-300">Msty (msty.app)</span>
            <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-300">Open WebUI (openwebui.com)</span>
            <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-300">LM Studio</span>
            <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-300">Ollama</span>
          </div>
        </div>

        {/* RAM Requirement Filter */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
          <span className="text-xs font-bold text-slate-400 mr-1">
            Filter by RAM:
          </span>
          <button
            type="button"
            data-testid="ram-filter-all"
            onClick={() => setRamFilter('all')}
            className={`min-h-[44px] min-w-[44px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              ramFilter === 'all'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-950/50'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            All Models ({MODELS_DATA.length})
          </button>
          <button
            type="button"
            data-testid="ram-filter-8gb"
            onClick={() => setRamFilter('8gb')}
            className={`min-h-[44px] min-w-[44px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              ramFilter === '8gb'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-950/50'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            8 GB RAM (MacBook Air / Base)
          </button>
          <button
            type="button"
            data-testid="ram-filter-16gb"
            onClick={() => setRamFilter('16gb')}
            className={`min-h-[44px] min-w-[44px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              ramFilter === '16gb'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-950/50'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            16 GB+ RAM (Pro / Max)
          </button>
        </div>
      </div>

      {/* Model Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredModels.map((model) => {
          // Only an exact version match counts as installed. A same-family
          // model of another version is named separately rather than folded
          // into the green badge — "Installed" on a Qwen 2.5 card while only
          // qwen3.6 is on disk is the same falsehood the playgrounds carried.
          const resolution = resolveModel(model.name);
          const installedTag = resolution?.exact ? resolution.tag : null;
          const otherBuild = resolution && !resolution.exact ? resolution : null;
          const pullCmd = model.ollamaPull;

          return (
            <div
              key={model.id}
              data-testid={`model-card-${model.id}`}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-5 hover:border-slate-700 transition-all"
            >
              <div className="space-y-4">
                {/* Header Info */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold text-indigo-400 bg-indigo-950/80 border border-indigo-800/60 px-2 py-0.5 rounded">
                        {model.family}
                      </span>
                      {installedTag ? (
                        <span
                          data-testid={`ollama-status-tag-${model.id}`}
                          className="text-xs font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded flex items-center gap-1"
                        >
                          🟢 Installed in Ollama
                        </span>
                      ) : (
                        <span
                          data-testid={`ollama-status-tag-${model.id}`}
                          className="text-xs font-semibold text-slate-400 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded flex items-center gap-1"
                        >
                          {pullCmd ? '⚪ Available via Ollama' : '⚪ Not served by Ollama'}
                        </span>
                      )}
                      {otherBuild && (
                        <span
                          data-testid={`ollama-other-version-${model.id}`}
                          className="text-xs font-semibold text-amber-400 bg-amber-950/80 border border-amber-800/60 px-2 py-0.5 rounded flex items-center gap-1"
                          title={`${otherBuild.tag} is installed, but this card is ${model.name}.`}
                        >
                          <span className="font-mono">{otherBuild.tag}</span> installed —{' '}
                          {MISMATCH_LABEL[otherBuild.mismatch]}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-100">{model.name}</h3>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-slate-400 block">{model.parameters}</span>
                    <span className="text-xs text-slate-400">{model.license}</span>
                  </div>
                </div>

                {/* Pull Command Bar if not installed.
                    An entry Ollama does not serve carries ollamaPull === null;
                    offering a copy button there hands the user a command that
                    404s (the Ollama library has no whisper entry). Those
                    entries name their own setup path instead. */}
                {!installedTag && !pullCmd && (
                  <div
                    data-testid={`no-ollama-path-${model.id}`}
                    className="flex items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs"
                  >
                    <span className="text-xs text-slate-400 font-medium shrink-0">Not on Ollama:</span>
                    <span className="text-xs text-slate-300 text-right">
                      Set up through {model.appPairing}
                    </span>
                  </div>
                )}
                {!installedTag && pullCmd && (
                  <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
                    <span className="text-xs text-slate-400 font-medium">Local Pull:</span>
                    <button
                      type="button"
                      data-testid={`copy-pull-cmd-${model.id}`}
                      onClick={() => handleCopyPull(pullCmd, model.id)}
                      className="text-xs font-mono bg-slate-900 hover:bg-slate-850 border border-slate-700 text-indigo-300 px-3 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer min-h-[44px] min-w-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      title={`Copy command: ${pullCmd}`}
                    >
                      {copiedId === model.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-indigo-400" />
                          <span>{pullCmd}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Description */}
                <p className="text-xs text-slate-300 leading-relaxed min-h-[40px]">
                  {model.description}
                </p>

                {/* Mac Performance & Memory Metrics */}
                <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                      <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                      <span>Mac RAM</span>
                    </div>
                    <div
                      data-testid={`ram-usage-${model.id}`}
                      className="text-xs font-bold text-sky-300"
                    >
                      {model.macRamRequired}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Apple Silicon</span>
                    </div>
                    <div
                      data-testid={`silicon-score-${model.id}`}
                      className="text-xs font-bold text-amber-300"
                    >
                      {model.appleSiliconScore}
                    </div>
                  </div>
                </div>

                {/* Recommended For Badges */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-400 block">
                    Best Used For:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {model.recommendedFor.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-xs bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Footer */}
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>App Pairing:</span>
                  <span className="font-semibold text-indigo-300">{model.appPairing}</span>
                </div>

                <button
                  type="button"
                  data-testid={`setup-modal-btn-${model.id}`}
                  onClick={() => setSelectedModelForModal(model)}
                  className="w-full min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <AppWindow className="w-4 h-4" />
                  <span>View Setup Steps</span>
                </button>
                <a
                  href={model.appUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`download-btn-${model.id}`}
                  className="w-full min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-md shadow-indigo-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Download App</span>
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* 1-Click Setup Steps Modal */}
      {selectedModelForModal && (
        <div
          data-testid="model-setup-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="model-setup-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            ref={modalRef}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-6 relative animate-in fade-in zoom-in duration-150"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs font-semibold text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60">
                  {selectedModelForModal.family}
                </span>
                <h3 id="model-setup-modal-title" className="text-xl font-bold text-slate-100 mt-1">
                  1-Click Setup Guide: {selectedModelForModal.name}
                </h3>
              </div>
              <button
                type="button"
                data-testid="close-modal-btn"
                onClick={() => setSelectedModelForModal(null)}
                className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Specs Summary */}
            <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block">Required Mac RAM:</span>
                <span className="font-bold text-sky-400">{selectedModelForModal.macRamRequired}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Performance Rating:</span>
                <span className="font-bold text-amber-400">{selectedModelForModal.appleSiliconScore}</span>
              </div>
            </div>

            {/* Setup Steps List */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>Zero-Code Non-Technical Download Instructions</span>
              </h4>

              <ol className="space-y-2.5">
                {selectedModelForModal.setupSteps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-300">
                    <span className="w-5 h-5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                <span>No Terminal Commands Needed</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={selectedModelForModal.appUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors min-h-[44px] flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Download App
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedModelForModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  Close Guide
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
