import React, { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { DemoBanner } from './DemoBanner';
import { MISMATCH_LABEL } from '../../utils/modelUtils';
import { OllamaMismatch } from '../../services/ollamaService';

export interface SharedPlaygroundProps {
  containerTestId: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  mode: 'live' | 'demo';
  onModeChange: (mode: 'live' | 'demo') => void;
  isLiveAvailable: boolean;
  /**
   * Whether Ollama itself is reachable — distinct from whether THIS
   * playground's model is installed. Without it the toggle says "(Offline)"
   * while the page header says "Ollama Active", which is now the common case:
   * a version mismatch leaves the engine up and the requested model absent.
   */
  engineAvailable?: boolean;
  modelTag: string;
  appName?: string;
  appUrl?: string;
  liveError?: string | null;
  /**
   * Set when a RELATIVE of the requested model is installed. The playground
   * stays in demo — it is not the model this page teaches — but silently
   * dropping the near-match is what let a Qwen 2.5 playground run on qwen3.6.
   * Naming both, and saying accurately how they differ, is the whole point.
   */
  substituteNote?: {
    requested: string;
    installed: string;
    mismatch: OllamaMismatch;
  } | null;
  children: ReactNode;
}

export const SharedPlayground: React.FC<SharedPlaygroundProps> = ({
  containerTestId,
  title,
  subtitle,
  icon,
  mode,
  onModeChange,
  isLiveAvailable,
  engineAvailable,
  modelTag,
  appName = 'LM Studio',
  appUrl = 'https://lmstudio.ai',
  liveError,
  substituteNote,
  children,
}) => {
  return (
    <div data-testid={containerTestId} className="space-y-6">
      {mode === 'demo' && <DemoBanner appName={appName} appUrl={appUrl} />}

      {/* Playground Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 data-testid="playground-title" className="text-xl font-bold text-slate-100 flex items-center gap-2">
            {icon}
            <span>{title}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Toggle Switch */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              data-testid="mode-toggle-live"
              onClick={() => onModeChange('live')}
              disabled={!isLiveAvailable}
              className={`px-3 py-2.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                mode === 'live'
                  ? 'bg-emerald-950 border border-emerald-700 text-emerald-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-slate-400'
              }`}
            >
              <span>🟢 Live Ollama Mode</span>
              {!isLiveAvailable && (
                <span data-testid="live-unavailable-reason" className="text-xs text-slate-400">
                  {engineAvailable ? '(Model not installed)' : '(Offline)'}
                </span>
              )}
            </button>

            <button
              type="button"
              data-testid="mode-toggle-demo"
              onClick={() => onModeChange('demo')}
              className={`px-3 py-2.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                mode === 'demo'
                  ? 'bg-amber-950 border border-amber-700 text-amber-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🟡 Demo Preview Mode</span>
            </button>
          </div>

          <div className="flex items-center gap-3 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">Model:</span>
            <span className="font-semibold text-emerald-400">{modelTag}</span>
          </div>
        </div>
      </div>

      {substituteNote && (
        <div
          data-testid="substitute-note"
          className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl text-xs text-amber-300 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-px" />
          <span>
            This playground runs on <span className="font-semibold">{substituteNote.requested}</span>, which
            is not installed. Ollama does have{' '}
            <span className="font-mono font-semibold">{substituteNote.installed}</span> —{' '}
            {MISMATCH_LABEL[substituteNote.mismatch]}, so it is not used here. Staying in demo
            until the requested model is pulled.
          </span>
        </div>
      )}

      {liveError && (
        <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl text-xs text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{liveError}</span>
        </div>
      )}

      {children}
    </div>
  );
};
