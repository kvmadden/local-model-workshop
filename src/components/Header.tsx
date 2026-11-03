import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { TabType } from '../types/workshop';
import { useOllamaStatus } from '../hooks/useOllamaStatus';
import { SECTIONS, VIEWS, sectionOf, type SectionId } from '../navigation';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

/** The mark: a small printed label, its first line in the amber. */
const LabelMark: React.FC = () => (
  <svg viewBox="0 0 32 24" width="32" height="24" aria-hidden="true" className="shrink-0 text-ink-2">
    <rect x="1" y="1" width="30" height="22" rx="4" fill="rgb(var(--panel))" stroke="currentColor" strokeWidth="1.5" />
    <line x1="7" y1="8" x2="25" y2="8" stroke="rgb(var(--accent-text))" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="7" y1="12.5" x2="21" y2="12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="7" y1="16.5" x2="16" y2="16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange, theme = 'dark', onToggleTheme }) => {
  const { available, models, loading } = useOllamaStatus();
  const nextTheme = theme === 'dark' ? 'Use light theme' : 'Use dark theme';
  const section = sectionOf(activeTab);

  // A section opens on the view last used in it.
  const [lastView, setLastView] = useState<Record<SectionId, TabType>>(
    () => Object.fromEntries(SECTIONS.map((s) => [s.id, s.views[0]])) as Record<SectionId, TabType>,
  );
  useEffect(() => {
    setLastView((m) => (m[section.id] === activeTab ? m : { ...m, [section.id]: activeTab }));
  }, [activeTab, section.id]);

  return (
    <header data-testid="workshop-header">
      <div className="border-b border-rule bg-band">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-10 px-4 sm:px-6 lg:px-10">
          <div className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 lg:flex-none">
            <LabelMark />
            <div className="min-w-0">
              <h1 data-testid="workshop-title" className="font-display text-[19px] font-semibold leading-tight text-ink">
                Local Model Workshop
              </h1>
              <p data-testid="workshop-subtitle" className="hidden text-[13px] leading-snug text-ink-3 xl:block">
                A test bench for local models reading medication instructions
              </p>
            </div>
          </div>

          {/* Three sections. On phones they take their own row under the title. */}
          <nav data-testid="workshop-sections" aria-label="Sections" className="order-last flex w-full lg:order-none lg:w-auto">
            {SECTIONS.map((s) => {
              const active = s.id === section.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-testid={s.testId}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onTabChange(lastView[s.id])}
                  className={`-mb-px min-h-[48px] flex-1 border-b-[3px] px-4 text-[16px] font-medium transition-colors lg:min-h-[64px] lg:flex-none ${
                    active ? 'border-accent-fill text-ink' : 'border-transparent text-ink-3 hover:text-ink'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1">
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
                className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-panel hover:text-ink"
              >
                {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" aria-hidden="true" /> : <Moon className="h-[18px] w-[18px]" aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* The views inside the open section: two or three, on one row at every width. */}
      <div className="border-b border-rule">
        <nav
          data-testid="workshop-nav-tabs"
          aria-label={`${section.label}: ${section.summary}`}
          className="mx-auto flex max-w-[1680px] gap-1 overflow-x-auto px-2 sm:px-4 lg:px-8"
        >
          {section.views.map((v) => {
            const active = v === activeTab;
            return (
              <button
                key={v}
                type="button"
                data-testid={VIEWS[v].testId}
                aria-current={active ? 'page' : undefined}
                onClick={() => onTabChange(v)}
                className={`-mb-px min-h-[44px] min-w-[44px] shrink-0 whitespace-nowrap border-b-2 px-3 text-[15px] font-medium transition-colors ${
                  active ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink'
                }`}
              >
                {VIEWS[v].label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
