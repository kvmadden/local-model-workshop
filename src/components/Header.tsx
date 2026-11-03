import React from 'react';
import { TabType } from '../types/workshop';
import { useOllamaStatus } from '../hooks/useOllamaStatus';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

const TABS: Array<{ id: TabType; testId: string; label: string }> = [
  { id: 'compare', testId: 'tab-run-comparison', label: 'Run comparison' },
  { id: 'builder', testId: 'tab-flow-builder', label: 'Flow builder' },
  { id: 'benchmark', testId: 'tab-benchmark-studio', label: 'Label audit' },
  { id: 'wizard', testId: 'tab-task-wizard', label: 'Task wizard' },
  { id: 'catalog', testId: 'tab-model-catalog', label: 'Models' },
  { id: 'studio', testId: 'tab-use-case-studio', label: 'Use cases' },
  { id: 'hardware', testId: 'tab-hardware-advisor', label: 'Hardware' },
  { id: 'shortcuts', testId: 'tab-shortcuts-studio', label: 'Shortcuts' },
];

/** The mark: a printed label with its tape tab and a barcode. */
const LabelMark: React.FC = () => (
  <svg viewBox="0 0 44 32" width="44" height="32" aria-hidden="true" className="shrink-0 text-ink">
    <rect x="1" y="1" width="42" height="30" fill="rgb(var(--label))" stroke="currentColor" strokeWidth="2" />
    <rect x="1" y="1" width="11" height="30" fill="rgb(var(--tape))" stroke="currentColor" strokeWidth="2" />
    <g fill="rgb(var(--label-ink))">
      <rect x="16" y="7" width="2" height="18" />
      <rect x="20" y="7" width="1" height="18" />
      <rect x="23" y="7" width="3" height="18" />
      <rect x="28" y="7" width="1" height="18" />
      <rect x="31" y="7" width="2" height="18" />
      <rect x="35" y="7" width="1" height="18" />
      <rect x="38" y="7" width="2" height="18" />
    </g>
  </svg>
);

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange, theme = 'dark', onToggleTheme }) => {
  const { available, models, loading } = useOllamaStatus();

  return (
    <header data-testid="workshop-header" className="border-b-2 border-ink bg-panel">
      <div className="mx-auto max-w-[1840px] px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <LabelMark />
            <div className="min-w-0">
              <h1 data-testid="workshop-title" className="font-display text-[22px] font-bold uppercase leading-none tracking-[0.04em] text-ink sm:text-[26px]">
                Local Model Workshop
              </h1>
              <p data-testid="workshop-subtitle" className="mt-1 font-mono text-[12px] leading-tight text-ink-3">
                A test bench for local models reading medication instructions
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Live Ollama status */}
            <div data-testid="ollama-header-badge" className="flex min-h-[44px] items-center">
              <span
                title={available ? `Installed models: ${models.length > 0 ? models.map((m) => m.name).join(', ') : 'none'}` : 'Run Ollama on this Mac for live model execution'}
                className="flex items-center gap-2 border border-rule-strong bg-bench px-2.5 py-1.5 font-mono text-[12px] text-ink-2"
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-2.5 w-2.5 ${loading ? 'bg-tape' : available ? 'bg-stamp-fill' : 'bg-rule-strong'}`}
                />
                <span>{loading ? 'Checking engine' : available ? `Ollama: ${models.length} model${models.length !== 1 ? 's' : ''}` : 'Ollama not reached'}</span>
              </span>
            </div>
            {onToggleTheme && (
              <button
                type="button"
                data-testid="theme-toggle"
                onClick={onToggleTheme}
                className="min-h-[44px] border border-rule-strong bg-panel px-3 font-display text-[14px] font-semibold uppercase tracking-[0.04em] text-ink hover:border-ink"
              >
                {theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
              </button>
            )}
          </div>
        </div>

        {/* Tabs, like printed label tabs: the open one carries the yellow tape and an ink rule. One row from
            1024 px, a clean grid below that, so no label is ever cut off at the edge of a scrolling strip. */}
        <nav data-testid="workshop-nav-tabs" aria-label="Workshop Sections" className="-mb-[2px] grid grid-cols-2 gap-0.5 overflow-x-auto pb-0 md:grid-cols-4 lg:flex lg:items-end">
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                data-testid={t.testId}
                aria-current={active ? 'page' : undefined}
                onClick={() => onTabChange(t.id)}
                className={`min-h-[44px] min-w-[44px] shrink-0 whitespace-nowrap border-b-[3px] px-3.5 text-left font-display text-[15px] font-semibold uppercase tracking-[0.04em] transition-colors lg:text-center ${
                  active ? 'border-ink bg-tape text-tape-ink' : 'border-transparent text-ink-2 hover:border-rule-strong hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
