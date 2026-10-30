import React from 'react';
import { TabType } from '../types/workshop';
import { Sparkles, Compass, Cpu, PlaySquare, Workflow, Loader2, Command, Columns } from 'lucide-react';
import { useOllamaStatus } from '../hooks/useOllamaStatus';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange }) => {
  const { available, models, loading } = useOllamaStatus();

  return (
    <header
      data-testid="workshop-header"
      className="border-b border-slate-800 bg-slate-900/90 px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-20 backdrop-blur-md"
    >
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-950/80 border border-indigo-800/50 rounded-xl text-indigo-400 shadow-md">
            <Sparkles className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1
              data-testid="workshop-title"
              className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2"
            >
              Local Model Workshop
            </h1>
            <p
              data-testid="workshop-subtitle"
              className="text-xs text-slate-400 font-medium"
            >
              Explore, compare and chain small local models
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 max-w-full overflow-hidden">
          {/* Navigation Tabs */}
          <nav
            data-testid="workshop-nav-tabs"
            aria-label="Workshop Sections"
            className="flex items-center gap-1.5 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800/80 overflow-x-auto max-w-full whitespace-nowrap"
          >
            <button
              type="button"
              data-testid="tab-task-wizard"
              onClick={() => onTabChange('wizard')}
              className={`min-h-[44px] min-w-[44px] px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                activeTab === 'wizard'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Task Wizard</span>
            </button>

            <button
              type="button"
              data-testid="tab-model-catalog"
              onClick={() => onTabChange('catalog')}
              className={`min-h-[44px] min-w-[44px] px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                activeTab === 'catalog'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Model Catalog</span>
            </button>

            <button
              type="button"
              data-testid="tab-use-case-studio"
              onClick={() => onTabChange('studio')}
              className={`min-h-[44px] min-w-[44px] px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                activeTab === 'studio'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <PlaySquare className="w-4 h-4" />
              <span>Use Case Studio</span>
            </button>

            <button
              type="button"
              data-testid="tab-hardware-advisor"
              onClick={() => onTabChange('hardware')}
              className={`min-h-[44px] min-w-[44px] px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                activeTab === 'hardware'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span>Hardware Advisor</span>
            </button>

            <button
              type="button"
              data-testid="tab-shortcuts-studio"
              onClick={() => onTabChange('shortcuts')}
              className={`min-h-[44px] min-w-[44px] px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                activeTab === 'shortcuts'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Command className="w-4 h-4 text-sky-400" />
              <span>Shortcuts Studio</span>
            </button>

            <button
              type="button"
              data-testid="tab-benchmark-studio"
              onClick={() => onTabChange('benchmark')}
              className={`min-h-[44px] min-w-[44px] px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                activeTab === 'benchmark'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Columns className="w-4 h-4 text-indigo-400" />
              <span>Benchmark Studio</span>
            </button>

            <button
              type="button"
              data-testid="tab-flow-builder"
              onClick={() => onTabChange('builder')}
              className={`min-h-[44px] min-w-[44px] px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                activeTab === 'builder'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Workflow className="w-4 h-4" />
              <span>Flow Builder</span>
            </button>
          </nav>

          {/* Live Ollama Status Badge */}
          <div
            data-testid="ollama-header-badge"
            className="flex items-center min-h-[44px]"
          >
            {loading ? (
              <span className="bg-slate-950/80 border border-slate-800 text-slate-400 text-xs px-3 py-1.5 rounded-full flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                <span>Checking...</span>
              </span>
            ) : available ? (
              <span
                title={`Installed models: ${
                  models.length > 0
                    ? models.map((m) => m.name).join(', ')
                    : 'None'
                }`}
                className="bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-2 shadow-sm cursor-help"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>
                  ● Ollama Active ({models.length} model{models.length !== 1 ? 's' : ''})
                </span>
              </span>
            ) : (
              <span
                title="Install & run Ollama from ollama.com for live model execution"
                className="bg-slate-950/80 border border-slate-800 text-slate-400 text-xs px-3 py-1.5 rounded-full flex items-center gap-2 cursor-help"
              >
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span>○ Ollama Offline</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
