import { useRef } from 'react';
import { Step } from '../types/flow';
import { Code, Sparkles } from 'lucide-react';

interface StepEditorProps {
  index: number;
  step: Step;
  onPromptChange: (prompt: string) => void;
  disabled?: boolean;
}

export const StepEditor: React.FC<StepEditorProps> = ({
  index,
  step,
  onPromptChange,
  disabled = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (varName: string) => {
    if (disabled) return;
    const textarea = textareaRef.current;
    if (!textarea) {
      onPromptChange(step.prompt + varName);
      return;
    }

    const start = textarea.selectionStart ?? step.prompt.length;
    const end = textarea.selectionEnd ?? step.prompt.length;
    const newPrompt = step.prompt.substring(0, start) + varName + step.prompt.substring(end);
    onPromptChange(newPrompt);

    // Reset focus and cursor position after insertion
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + varName.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Generate available context chips for preceding steps
  const availableChips: Array<{ label: string; value: string }> = [
    { label: 'Initial Input', value: '{{input}}' },
  ];

  for (let i = 0; i < index; i++) {
    const prevStepNum = i + 1;
    availableChips.push({
      label: `Step ${prevStepNum} Output`,
      value: `{{step${prevStepNum}.output}}`,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
        <span className="flex items-center gap-1.5">
          <Code className="w-3.5 h-3.5 text-indigo-400" />
          Prompt Template Editor
        </span>
        <span className="text-slate-400">Supports double-curly placeholders</span>
      </div>

      <textarea
        ref={textareaRef}
        data-testid={`step-prompt-textarea-${index}`}
        value={step.prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        disabled={disabled}
        placeholder={`Enter prompt template for Step ${index + 1}... Use {{input}} or {{step1.output}} to chain data.`}
        rows={4}
        className="w-full min-h-[110px] bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-transparent font-mono text-sm resize-y leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {/* Variable Template Hints / Chips */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-400" />
          Insert Variable:
        </span>
        {availableChips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => insertVariable(chip.value)}
            disabled={disabled}
            className="h-11 min-h-[44px] min-w-[44px] px-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-indigo-300 font-mono text-xs font-medium rounded-lg border border-slate-700/80 flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title={`Insert ${chip.value}`}
          >
            {chip.value}
          </button>
        ))}
      </div>
    </div>
  );
};
