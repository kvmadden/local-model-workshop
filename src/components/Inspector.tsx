import React from 'react';
import { Step } from '../types/flow';
import { Eye, Edit3 } from 'lucide-react';

interface InspectorProps {
  index: number;
  step: Step;
  onUpdateOutput: (output: string) => void;
  disabled?: boolean;
}

export const Inspector: React.FC<InspectorProps> = ({
  index,
  step,
  onUpdateOutput,
  disabled = false,
}) => {
  return (
    <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-indigo-400" />
          Step Inspector & Execution Output
        </span>
        <span className="font-mono text-slate-400 shrink-0 whitespace-nowrap">
          {step.output ? `${step.output.length} chars` : 'No output'}
        </span>
      </div>

      {/* Output Display Container */}
      <div
        data-testid={`step-output-container-${index}`}
        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-slate-100 font-mono text-sm min-h-[60px] whitespace-pre-wrap break-words"
      >
        {step.output ? (
          step.output
        ) : (
          <span className="text-slate-400 italic">Output will appear here after execution...</span>
        )}
      </div>

      {/* Output Editor Textarea (Allows downstream state override) */}
      <div className="space-y-1 pt-1">
        <label className="text-xs text-slate-400 flex items-center gap-1 font-medium">
          <Edit3 className="w-3.5 h-3.5 text-slate-400" />
          Override Intermediate Output
        </label>
        <textarea
          data-testid={`step-output-editor-${index}`}
          value={step.output}
          onChange={(e) => onUpdateOutput(e.target.value)}
          onInput={(e: React.FormEvent<HTMLTextAreaElement>) => onUpdateOutput((e.target as HTMLTextAreaElement).value)}
          disabled={disabled}
          placeholder="Edit output manually to override downstream prompt context..."
          rows={2}
          className="w-full min-h-[60px] bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 font-mono text-xs resize-y disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
};
