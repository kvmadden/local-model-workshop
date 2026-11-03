import React, { useState } from 'react';
import { Mic, FileText, Edit3, MessageSquare } from 'lucide-react';
import { VoiceTranscriptionPlayground } from './playgrounds/VoiceTranscriptionPlayground';
import { DocSummarizingPlayground } from './playgrounds/DocSummarizingPlayground';
import { DictationCleanupPlayground } from './playgrounds/DictationCleanupPlayground';
import { FileChattingPlayground } from './playgrounds/FileChattingPlayground';

export const UseCaseStudio: React.FC = () => {
  const [activeUseCaseId, setActiveUseCaseId] = useState<'transcription' | 'summarizing' | 'dictation' | 'file-chat'>('transcription');

  return (
    <div data-testid="use-case-studio-container" className="space-y-6">
      {/* Studio Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-2">
        <p className="font-mono text-[12px] text-ink-3">Interactive Zero-Code Playgrounds</p>
        <h2 data-testid="studio-heading" className="font-display text-3xl sm:text-4xl font-bold uppercase leading-none tracking-[0.01em] text-ink">
          Use Case Studio: Test Small Models Live
        </h2>
        <p className="max-w-3xl text-[16px] leading-snug text-ink-2">
          Experience real non-technical local workflows. Choose a playground below, pick sample data or enter your own text, and run the processing engine locally on your Mac.
        </p>
      </div>

      {/* Playground Sub-Navigation */}
      <div
        data-testid="playground-selector"
        className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950 p-2 rounded-2xl border border-slate-800"
      >
        <button
          type="button"
          data-testid="usecase-tab-transcription"
          onClick={() => setActiveUseCaseId('transcription')}
          className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer min-h-[44px] ${
            activeUseCaseId === 'transcription'
              ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200 font-semibold shadow-md'
              : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Mic className="w-5 h-5 text-indigo-400 shrink-0" />
          <div>
            <div className="text-xs font-bold">Voice Transcription</div>
            <div className="text-[10px] text-slate-400 font-normal">Whisper Large-v3</div>
          </div>
        </button>

        <button
          type="button"
          data-testid="usecase-tab-summarizing"
          onClick={() => setActiveUseCaseId('summarizing')}
          className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer min-h-[44px] ${
            activeUseCaseId === 'summarizing'
              ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200 font-semibold shadow-md'
              : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
          <div>
            <div className="text-xs font-bold">Confidential Summaries</div>
            <div className="text-[10px] text-slate-400 font-normal">Llama 3.2 (3B)</div>
          </div>
        </button>

        <button
          type="button"
          data-testid="usecase-tab-dictation"
          onClick={() => setActiveUseCaseId('dictation')}
          className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer min-h-[44px] ${
            activeUseCaseId === 'dictation'
              ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200 font-semibold shadow-md'
              : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Edit3 className="w-5 h-5 text-indigo-400 shrink-0" />
          <div>
            <div className="text-xs font-bold">Dictation Cleanup</div>
            <div className="text-[10px] text-slate-400 font-normal">Phi-3.5 (3.8B)</div>
          </div>
        </button>

        <button
          type="button"
          data-testid="usecase-tab-file-chat"
          onClick={() => setActiveUseCaseId('file-chat')}
          className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer min-h-[44px] ${
            activeUseCaseId === 'file-chat'
              ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200 font-semibold shadow-md'
              : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <MessageSquare className="w-5 h-5 text-indigo-400 shrink-0" />
          <div>
            <div className="text-xs font-bold">File Chatting</div>
            <div className="text-[10px] text-slate-400 font-normal">Qwen 2.5 (7B)</div>
          </div>
        </button>
      </div>

      {/* Active Playground Work Area */}
      <div
        data-testid={`playground-area-${activeUseCaseId}`}
        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6"
      >
        {activeUseCaseId === 'transcription' && <VoiceTranscriptionPlayground />}
        {activeUseCaseId === 'summarizing' && <DocSummarizingPlayground />}
        {activeUseCaseId === 'dictation' && <DictationCleanupPlayground />}
        {activeUseCaseId === 'file-chat' && <FileChattingPlayground />}
      </div>
    </div>
  );
};
