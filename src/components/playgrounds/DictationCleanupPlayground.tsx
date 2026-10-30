import React, { useState } from 'react';
import { Edit3, Sparkles, CheckCircle2, ArrowRight, Wand2 } from 'lucide-react';
import { USE_CASES_DATA } from '../../data/useCases';
import { generateStream } from '../../services/ollamaService';
import { usePlaygroundState } from '../../hooks/usePlaygroundState';
import { SharedPlayground } from './SharedPlayground';

export const DictationCleanupPlayground: React.FC = () => {
  const useCase = USE_CASES_DATA['dictation'];
  const {
    available,
    matchingTag,
    substituteNote,
    isLiveAvailable,
    mode,
    setMode,
    selectedSampleIndex,
    setSelectedSampleIndex,
    isProcessing,
    setIsProcessing,
    liveError,
    setLiveError,
  } = usePlaygroundState({ modelName: 'Phi-3.5 (3.8B)' });

  const [inputText, setInputText] = useState<string>(useCase.sampleInputs[0].content);
  const [removeFillerWords, setRemoveFillerWords] = useState<boolean>(true);
  const [polishedOutput, setPolishedOutput] = useState<string>(useCase.defaultOutput);

  const handleSelectSample = (idx: number) => {
    setSelectedSampleIndex(idx);
    const sample = useCase.sampleInputs[idx];
    if (sample) {
      setInputText(sample.content);
    }
  };

  const runDemoPolish = () => {
    setIsProcessing(true);
    setTimeout(() => {
      let result = '';
      if (selectedSampleIndex === 0) {
        result = `Polished Dictation Output:\nCleaned up formatting and removed filler words.\n\nSubject: Project Status Update — Test Suite Completion\n\nHi team,\n\nI am pleased to inform you that our project test suite is now fully complete and verified with all 15 test cases passing green.\n\nPlease let me know if you have any questions.\n\nBest regards,\nLocal Model Workshop Team`;
      } else if (selectedSampleIndex === 1) {
        result = `Model Catalog Design Requirements:\n- Highlight Mac RAM usage (8GB vs 16GB).\n- Display Apple Silicon performance ratings (score out of 10).\n- Ensure zero-code clarity for non-technical users.`;
      } else {
        result = `Feature Release Announcement:\nWe are excited to launch the new Zero-Code Local Model Workshop! Designed specifically for Apple Silicon Macs, this release features zero code blocks, zero JSON configs, and zero complex syntax.`;
      }

      if (removeFillerWords) {
        result += `\n\n[Refined with filler word removal active]`;
      }

      setPolishedOutput(result);
      setIsProcessing(false);
    }, 400);
  };

  const runLivePolish = async () => {
    if (!matchingTag) {
      setLiveError('Phi-3.5 model not installed in Ollama. Falling back to Demo mode.');
      setMode('demo');
      runDemoPolish();
      return;
    }

    setIsProcessing(true);
    setPolishedOutput('');
    setLiveError(null);

    let prompt = `Clean up and polish the following spoken dictation into clear, professional executive prose:\n\nOriginal Dictation: "${inputText}"`;
    if (removeFillerWords) {
      prompt += `\n\nNote: Strip out all filler words like 'uh', 'um', 'like', 'you know', 'so basically'.`;
    }

    try {
      await generateStream(
        matchingTag,
        prompt,
        (chunk) => {
          setPolishedOutput((prev) => prev + chunk);
        },
        { systemPrompt: 'You are an executive dictation editor that transforms spoken rambles into clean memos.' }
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn('Live dictation polishing failed:', errorMessage);
      setLiveError('Live streaming connection lost. Falling back to interactive demo.');
      setMode('demo');
      runDemoPolish();
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePolish = () => {
    if (!inputText.trim()) return;
    if (mode === 'live' && isLiveAvailable) {
      runLivePolish();
    } else {
      runDemoPolish();
    }
  };

  return (
    <SharedPlayground
      containerTestId="dictation-cleanup-playground"
      title="Dictation Cleanup Playground"
      subtitle="Transform messy spoken ramble and voice dictation into polished memos and executive emails."
      icon={<Edit3 className="w-5 h-5 text-indigo-400" />}
      mode={mode}
      onModeChange={setMode}
      isLiveAvailable={isLiveAvailable}
      engineAvailable={available}
      modelTag={matchingTag || useCase.recommendedModel}
      substituteNote={substituteNote}
      appName="LM Studio"
      appUrl="https://lmstudio.ai"
      liveError={liveError}
    >
      {/* Preset Ramble Chips & Cleanup Toggle */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            1. Select Spoken Ramble Sample or Type Text:
          </label>

          {/* Filler Word Cleanup Toggle */}
          <label className="inline-flex items-center gap-2.5 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              data-testid="filler-cleanup-toggle"
              checked={removeFillerWords}
              onChange={(e) => setRemoveFillerWords(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded border-slate-700 bg-slate-900 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="text-xs font-semibold text-slate-300">
              Filter Filler Words ("uh", "um", "like")
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {useCase.sampleInputs.map((sample, idx) => (
            <button
              key={sample.id}
              type="button"
              data-testid={`ramble-chip-${idx}`}
              onClick={() => handleSelectSample(idx)}
              className={`p-3 rounded-xl border text-xs text-left transition-all cursor-pointer min-h-[44px] flex items-center justify-between gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                selectedSampleIndex === idx
                  ? 'bg-indigo-950/70 border-indigo-500 text-indigo-200 font-semibold shadow-md'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <div data-testid={`sample-input-btn-${idx}`} className="flex items-center justify-between w-full">
                <span className="truncate">{sample.label}</span>
                {selectedSampleIndex === idx && <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />}
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <textarea
            data-testid="dictation-input-textarea"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type or paste rough spoken dictation here..."
            rows={4}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
        </div>

        <button
          type="button"
          data-testid="polish-dictation-btn"
          onClick={handlePolish}
          disabled={isProcessing || !inputText.trim()}
          className="w-full min-h-[44px] px-5 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <span data-testid="run-playground-btn" className="flex items-center gap-2">
            {isProcessing ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin text-indigo-200" />
                <span>
                  {mode === 'live'
                    ? `Streaming Polished Prose from Ollama (${matchingTag})...`
                    : 'Polishing Dictation On Apple Silicon GPU...'}
                </span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>
                  {mode === 'live' ? 'Polish Live via Ollama' : 'Polish Spoken Dictation'}
                </span>
              </>
            )}
          </span>
        </button>
      </div>

      {/* Side-by-Side Spoken vs Polished View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
        {/* Spoken Ramble Box */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Original Spoken Ramble:
          </span>
          <div
            data-testid="spoken-ramble-view"
            className="w-full min-h-[220px] bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-400 text-sm leading-relaxed italic"
          >
            "{inputText}"
          </div>
        </div>

        {/* Polished Memo Output Box */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Polished Professional Output:
            </span>
            <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
              <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
              Ready to Send
            </span>
          </div>

          <div
            data-testid="polished-memo-view"
            className="w-full min-h-[220px] bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-100 text-sm leading-relaxed whitespace-pre-wrap flex flex-col justify-between"
          >
            <div data-testid="playground-output-container">
              {polishedOutput}
              {isProcessing && mode === 'live' && (
                <span className="inline-block w-2 h-4 ml-1 bg-emerald-400 animate-pulse" />
              )}
            </div>

            <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Model: {matchingTag || 'Microsoft Phi-3.5 Mini'}</span>
              <span>Mode: {mode === 'live' ? 'Live Streaming' : 'Clean Executive Prose'}</span>
            </div>
          </div>
        </div>
      </div>
    </SharedPlayground>
  );
};
