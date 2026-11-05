import React from 'react';
import { ExecutionStatus } from '../types/flow';
import { Workflow, Layers } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  flowStatus?: ExecutionStatus;
}

export const Layout: React.FC<LayoutProps> = ({ children, flowStatus = 'idle' }) => {
  const getStatusBadgeStyle = (status: ExecutionStatus) => {
    switch (status) {
      case 'running':
        return 'bg-amber-950/80 text-amber-400 border-amber-800/80 animate-pulse';
      case 'completed':
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80';
      case 'error':
        return 'bg-rose-950/80 text-rose-400 border-rose-800/80';
      case 'idle':
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div
      data-testid="app-container"
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased"
    >
      <header className="border-b border-slate-800 bg-slate-900/90 px-6 py-3 sticky top-0 z-20 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-950/80 border border-indigo-800/50 rounded-lg text-indigo-400">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-100 flex items-center gap-2">
                Local Model Workshop
              </h1>
              <p className="text-xs text-slate-400">Client-Side Linear Model Orchestration</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Layers className="w-4 h-4 text-slate-400" />
              <span>Status:</span>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadgeStyle(
                  flowStatus
                )}`}
              >
                {flowStatus}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6">
        {children}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 text-center text-xs text-slate-400">
        Local Model Workshop &bull; Flow engine
      </footer>
    </div>
  );
};
