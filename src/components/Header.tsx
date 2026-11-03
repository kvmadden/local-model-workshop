import React from 'react';
import { Moon, Sun } from 'lucide-react';
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

/** The mark: a small printed label, its first line in the accent. */
const LabelMark: React.FC = () => (
  <svg viewBox="0 0 32 24" width="32" height="24" aria-hidden="true" className="shrink-0 text-ink-3">
    <rect x="1" y="1" width="30" height="22" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <line x1="7" y1="8" x2="25" y2="8" stroke="rgb(var(--accent-text))" strokeWidth="2" strokeLinecap="round" />
    <line x1="7" y1="12.5" x2="21" y2="12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="7" y1="16.5" x2="16" y2="16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange, theme = 'dark', onToggleTheme }) => {
  const { available, models, loading } = useOllamaStatus();
  const nextTheme = theme === 'dark' ? 'Use light theme' : 'Use dark theme';

  return (
    <header data-testid="workshop-header" className="border-b border-rule bg-panel">
      <div className="mx-auto max-w-[1680px] px-4 sm:px-6 lg:px-10">
        <div className="flex items-center justify-between gap-4 pb-2 pt-3">
          <div className="flex min-w-0 items-center gap-3">
            <LabelMark />
            <div className="min-w-0">
              <h1 data-testid="workshop-title" className="text-[17px] font-semibold leading-tight text-ink">
                Local Model Workshop
              </h1>
              <p data-testid="workshop-subtitle" className="hidden text-[13px] leading-snug text-ink-3 sm:block">
                A test bench for local models reading medication instructions
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {/* Live Ollama status, as plain text with a small dot */}
            <div
              data-testid="ollama-header-badge"
              title={available ? `Installed models: ${models.length > 0 ? models.map((m) => m.name).join(', ') : 'none'}` : 'Run Ollama on this Mac for live model execution'}
              className="hidden min-h-[44px] items-center gap-2 px-2 text-[13px] text-ink-3 sm:flex"
            >
              <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${available ? 'bg-accent-fill' : 'bg-slate-600'}`} />
              <span>{loading ? 'Checking engine' : available ? `Ollama: ${models.length} model${models.length !== 1 ? 's' : ''}` : 'Ollama not reached'}</span>
            </div>
            {onToggleTheme && (
              <button
                type="button"
                data-testid="theme-toggle"
                onClick={onToggleTheme}
                aria-label={nextTheme}
                title={nextTheme}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-slate-850 hover:text-ink"
              >
                {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" aria-hidden="true" /> : <Moon className="h-[18px] w-[18px]" aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>

        {/* Tabs: one row from 1024 px, a clean grid below that, so no label is ever cut off at the
            edge of a scrolling strip. The open tab is marked by ink text and an accent rule. */}
        <nav data-testid="workshop-nav-tabs" aria-label="Workshop Sections" className="-mb-px grid grid-cols-2 overflow-x-auto min-[400px]:grid-cols-3 md:grid-cols-4 lg:flex lg:gap-1">
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                data-testid={t.testId}
                aria-current={active ? 'page' : undefined}
                onClick={() => onTabChange(t.id)}
                className={`min-h-[44px] min-w-[44px] shrink-0 whitespace-nowrap border-b-2 px-3 text-left text-[15px] font-medium transition-colors lg:text-center ${
                  active ? 'border-accent-fill text-ink' : 'border-transparent text-ink-3 hover:text-ink'
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
