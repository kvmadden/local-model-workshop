import React from 'react';
import { ExecutionStatus } from '../types/flow';
import { Plus, Play, Terminal } from 'lucide-react';

interface FlowCanvasProps {
  flowTitle: string;
  onFlowTitleChange: (title: string) => void;
  initialInput: string;
  onInitialInputChange: (input: string) => void;
  onAddStep: () => void;
  onRunFlow: () => void;
  flowStatus: ExecutionStatus;
  children: React.ReactNode;
}

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  flowTitle,
  onFlowTitleChange,
  initialInput,
  onInitialInputChange,
  onAddStep,
  onRunFlow,
  flowStatus,
  children,
}) => {
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
    <div data-testid="flow-canvas" className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-balance text-ink sm:text-[28px]">Flow builder</h2>
        <p className="max-w-3xl text-[17px] leading-relaxed text-ink-2">
          Chain prompt steps. Each step runs on the built-in mock, a local Ollama or an OpenAI-compatible server on this Mac, and each later step can read an earlier step's output.
        </p>
      </div>
      {/* Top Controls Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 flex items-center gap-3">
            <input
              type="text"
              data-testid="flow-title-input"
              value={flowTitle}
              onChange={(e) => onFlowTitleChange(e.target.value)}
              disabled={flowStatus === 'running'}
              placeholder="Flow Title"
              className="h-11 min-h-[44px] w-full max-w-md bg-slate-950 border border-slate-800 rounded-lg px-4 text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span
              data-testid="flow-status-badge"
              className={`h-11 min-h-[44px] px-3 py-1 rounded-lg text-xs font-bold border inline-flex items-center justify-center shrink-0 ${getStatusBadgeStyle(
                flowStatus
              )}`}
            >
              {flowStatus}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              data-testid="add-step-btn"
              onClick={onAddStep}
              disabled={flowStatus === 'running'}
              className="h-11 min-h-[44px] min-w-[44px] px-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 text-indigo-400 hover:text-indigo-300 font-medium rounded-lg border border-slate-700 flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              <span>Add Step</span>
            </button>

            <button
              type="button"
              data-testid="run-flow-btn"
              onClick={onRunFlow}
              disabled={flowStatus === 'running'}
              className="h-11 min-h-[44px] min-w-[44px] px-5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Run Flow</span>
            </button>
          </div>
        </div>

        {/* Initial Input Section */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <label className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              Initial Input Context
            </span>
            <span className="text-slate-400">Accessible as &#123;&#123;input&#125;&#125; or &#123;&#123;initialInput&#125;&#125;</span>
          </label>
          <textarea
            data-testid="initial-input-textarea"
            value={initialInput}
            onChange={(e) => onInitialInputChange(e.target.value)}
            disabled={flowStatus === 'running'}
            placeholder="Enter starting prompt text, document content, or input data..."
            rows={3}
            className="w-full min-h-[88px] bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-transparent text-sm resize-y disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
};
