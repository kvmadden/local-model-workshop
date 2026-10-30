import React, { useState, useEffect, useRef } from 'react';
import { TASKS_DATA } from '../data/tasks';
import { TaskOption } from '../types/workshop';
import { Compass, CheckCircle2, ShieldCheck, Cpu, AppWindow, ExternalLink } from 'lucide-react';

export const TaskWizard: React.FC = () => {
  const [selectedTask, setSelectedTask] = useState<TaskOption>(TASKS_DATA[0]);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState<boolean>(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSetupModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSetupModalOpen(false);
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      if (modalRef.current) {
        const first = modalRef.current.querySelector<HTMLElement>('button, [href]');
        first?.focus();
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isSetupModalOpen]);

  return (
    <div data-testid="task-wizard-container" className="space-y-6">
      {/* Hero Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-950/80 border border-indigo-800/60 rounded-full text-xs font-semibold text-indigo-400">
            <Compass className="w-3.5 h-3.5" />
            <span>Zero-Code Local AI Assistant</span>
          </div>
          <h2 data-testid="wizard-heading" className="text-2xl md:text-3xl font-extrabold text-slate-100 tracking-tight">
            Match Your Mac Goal to the Perfect Local Model &amp; App
          </h2>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            Select what you want to accomplish on your Mac today. We match your objective with the ideal 100% private offline app — no coding, terminal scripts, or technical setup required.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Supported Mac Apps:</span>
            <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-indigo-300">Jan (jan.ai)</span>
            <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-indigo-300">GPT4All (gpt4all.io)</span>
            <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-indigo-300">Msty (msty.app)</span>
            <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-indigo-300">Open WebUI (openwebui.com)</span>
            <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-indigo-300">LM Studio</span>
            <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-indigo-300">AnythingLLM</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Task Selection List */}
        <section className="lg:col-span-5 space-y-3" aria-label="Task Selection">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider px-1 flex items-center justify-between">
            <span>Select Your Goal</span>
            <span className="text-xs text-indigo-400 font-normal">{TASKS_DATA.length} Goals Available</span>
          </h3>

          <div className="space-y-2.5">
            {TASKS_DATA.map((task) => {
              const isSelected = selectedTask.id === task.id;
              return (
                <button
                  key={task.id}
                  type="button"
                  data-testid={`task-option-${task.id}`}
                  onClick={() => setSelectedTask(task)}
                  className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer min-h-[44px] flex items-start justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                    isSelected
                      ? 'bg-indigo-950/50 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-850 text-slate-300'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-indigo-400 border border-slate-700">
                        {task.category}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-100 block">{task.title}</span>
                    <p className="text-xs text-slate-400 line-clamp-2">{task.description}</p>
                  </div>
                  {isSelected && <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0 mt-1" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Goal Recommendation Card */}
        <section className="lg:col-span-7" aria-label="Goal Recommendation Details">
          <div
            data-testid="task-recommendation-card"
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 sticky top-24"
          >
            <div className="border-b border-slate-800 pb-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Runs on your Mac when paired with a local app</span>
              </div>
              <h3 className="text-xl font-bold text-slate-100">{selectedTask.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{selectedTask.description}</p>
            </div>

            {/* Recommendation Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                  <AppWindow className="w-4 h-4 text-indigo-400" />
                  <span>Recommended Mac App</span>
                </div>
                <div
                  data-testid="recommended-app"
                  className="text-base font-extrabold text-indigo-300"
                >
                  {selectedTask.recommendedApp}
                </div>
                <p className="text-xs text-slate-400">Zero-code desktop app for macOS</p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span>Recommended Model</span>
                </div>
                <div
                  data-testid="recommended-model"
                  className="text-base font-extrabold text-emerald-300"
                >
                  {selectedTask.recommendedModel}
                </div>
                <p className="text-xs text-slate-400">Optimized for Apple Silicon GPU</p>
              </div>
            </div>

            {/* Workflow preview */}
            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Zero-Code Workflow</span>
              <div className="text-xs font-medium text-indigo-300 bg-slate-950 p-3 rounded-lg border border-slate-800">
                {selectedTask.sampleWorkflow}
              </div>
            </div>

            {/* Download App Button */}
            <a
              href={selectedTask.appUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="download-app-btn"
              className="w-full min-h-[44px] px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-md shadow-indigo-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Download {selectedTask.recommendedApp}</span>
            </a>

            {/* View Setup Guide Modal Action & Inline Steps */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-200">1-Click Zero-Code Setup Guide</h4>
                <button
                  type="button"
                  data-testid="view-setup-guide-btn"
                  onClick={() => setIsSetupModalOpen(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  <AppWindow className="w-3.5 h-3.5" />
                  <span>Open Full Setup Modal</span>
                </button>
              </div>

              <ol data-testid="setup-steps-list" className="space-y-2.5">
                {selectedTask.setupSteps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs text-slate-300">
                    <span className="w-5 h-5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      </div>

      {/* Interactive Setup Guide Modal */}
      {isSetupModalOpen && (
        <div
          data-testid="task-setup-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-setup-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            ref={modalRef}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-6 relative"
          >
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs font-semibold text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60">
                  {selectedTask.category}
                </span>
                <h3 id="task-setup-modal-title" className="text-xl font-bold text-slate-100 mt-1">
                  Setup Guide: {selectedTask.title}
                </h3>
              </div>
              <button
                type="button"
                data-testid="close-task-modal-btn"
                onClick={() => setIsSetupModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block">Recommended Mac App:</span>
                <span className="font-bold text-indigo-300">{selectedTask.recommendedApp}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Recommended Model:</span>
                <span className="font-bold text-emerald-300">{selectedTask.recommendedModel}</span>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-200">Step-by-Step Installation &amp; Setup</h4>
              <ol className="space-y-2.5">
                {selectedTask.setupSteps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-300">
                    <span className="w-5 h-5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsSetupModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                Close Setup Guide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
