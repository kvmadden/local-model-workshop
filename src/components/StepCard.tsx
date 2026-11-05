import React from 'react';
import { Step, StepStatus, ModelConfig, ExecutionStatus } from '../types/flow';
import { StepEditor } from './StepEditor';
import { EndpointSettings } from './EndpointSettings';
import { Inspector } from './Inspector';
import {
  Play,
  ArrowUp,
  ArrowDown,
  Trash2,
  Clock,
  AlertTriangle,
} from 'lucide-react';

interface StepCardProps {
  index: number;
  totalSteps: number;
  step: Step;
  onUpdateStep: (updatedStep: Step) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDeleteStep: () => void;
  onRunStep: () => void;
  flowStatus?: ExecutionStatus;
}

export const StepCard: React.FC<StepCardProps> = ({
  index,
  totalSteps,
  step,
  onUpdateStep,
  onMoveUp,
  onMoveDown,
  onDeleteStep,
  onRunStep,
  flowStatus,
}) => {
  const isExecuting = flowStatus === 'running' || step.status === 'running';

  const getStatusBadgeStyle = (status: StepStatus) => {
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

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateStep({
      ...step,
      name: e.target.value,
    });
  };

  const handlePromptChange = (prompt: string) => {
    onUpdateStep({
      ...step,
      prompt,
    });
  };

  const handleModelConfigChange = (modelConfig: ModelConfig) => {
    onUpdateStep({
      ...step,
      modelConfig,
    });
  };

  const handleOutputChange = (output: string) => {
    onUpdateStep({
      ...step,
      output,
    });
  };

  const showErrorContainer = step.status === 'error' || Boolean(step.error);

  return (
    <div
      data-testid={`step-card-${index}`}
      className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden space-y-4 p-5 transition-all"
    >
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="h-11 w-11 min-h-[44px] min-w-[44px] bg-indigo-950/60 border border-indigo-800/50 rounded-lg text-indigo-400 text-sm font-bold flex items-center justify-center shrink-0">
            #{index + 1}
          </div>

          <input
            type="text"
            data-testid={`step-title-input-${index}`}
            value={step.name}
            onChange={handleTitleChange}
            disabled={isExecuting}
            placeholder="Step Name"
            className="h-11 min-h-[44px] bg-slate-950 border border-slate-800 rounded-lg px-3 text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 text-sm flex-1 max-w-xs disabled:opacity-50 disabled:cursor-not-allowed"
          />

          <span
            data-testid={`step-status-badge-${index}`}
            className={`h-11 min-h-[44px] px-3 py-1 rounded-lg text-xs font-bold border inline-flex items-center justify-center shrink-0 ${getStatusBadgeStyle(
              step.status
            )}`}
          >
            {step.status}
          </span>

          {step.latencyMs !== undefined && (
            <span
              data-testid={`step-latency-badge-${index}`}
              className="h-11 min-h-[44px] px-3 py-1 bg-slate-950 text-slate-400 border border-slate-800 rounded-lg text-xs flex items-center gap-1 shrink-0"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              {step.latencyMs}ms
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid={`step-run-btn-${index}`}
            onClick={onRunStep}
            disabled={isExecuting}
            className="h-11 min-h-[44px] px-3.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-medium text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="Run step individually"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Step</span>
          </button>

          <button
            type="button"
            data-testid={`step-move-up-btn-${index}`}
            onClick={onMoveUp}
            disabled={index === 0 || isExecuting}
            className="h-11 w-11 min-h-[44px] min-w-[44px] bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-700 flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="Move step up"
          >
            <ArrowUp className="w-4 h-4" />
          </button>

          <button
            type="button"
            data-testid={`step-move-down-btn-${index}`}
            onClick={onMoveDown}
            disabled={index === totalSteps - 1 || isExecuting}
            className="h-11 w-11 min-h-[44px] min-w-[44px] bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-700 flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="Move step down"
          >
            <ArrowDown className="w-4 h-4" />
          </button>

          <button
            type="button"
            data-testid={`step-delete-btn-${index}`}
            onClick={onDeleteStep}
            disabled={totalSteps <= 1 || isExecuting}
            className="h-11 w-11 min-h-[44px] min-w-[44px] bg-rose-950/40 hover:bg-rose-900/60 disabled:opacity-30 text-rose-300 rounded-lg border border-rose-800/60 flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            title="Delete step"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Conditional Error Banner */}
      {showErrorContainer && (
        <div
          data-testid={`step-error-container-${index}`}
          className="bg-rose-950/60 border border-rose-800/80 rounded-lg p-3 text-rose-300 text-xs flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Step Execution Error: </span>
            {step.error || 'Execution failed due to missing prompt or simulated backend error.'}
          </div>
        </div>
      )}

      {/* Editor & Configurations. On wide screens the prompt sits beside its settings and output. */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:items-start">
        <StepEditor
          index={index}
          step={step}
          onPromptChange={handlePromptChange}
          disabled={isExecuting}
        />

        <div className="min-w-0 space-y-5">
          <EndpointSettings
            index={index}
            config={step.modelConfig}
            onChange={handleModelConfigChange}
            disabled={isExecuting}
          />

          <Inspector
            index={index}
            step={step}
            onUpdateOutput={handleOutputChange}
            disabled={isExecuting}
          />
        </div>
      </div>
    </div>
  );
};
