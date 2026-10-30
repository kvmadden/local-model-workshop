import React, { useState } from 'react';
import { FileText, Sparkles, Lock, CheckCircle2, ShieldCheck } from 'lucide-react';
import { USE_CASES_DATA } from '../../data/useCases';
import { generateStream } from '../../services/ollamaService';
import { usePlaygroundState } from '../../hooks/usePlaygroundState';
import { SharedPlayground } from './SharedPlayground';

export const DocSummarizingPlayground: React.FC = () => {
  const useCase = USE_CASES_DATA['summarizing'];
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
  } = usePlaygroundState({ modelName: 'Llama 3.2 (3B)' });

  const [inputText, setInputText] = useState<string>(useCase.sampleInputs[0].content);
  const [summaryOutput, setSummaryOutput] = useState<string>(useCase.defaultOutput);

  const handleSelectSample = (idx: number) => {
    setSelectedSampleIndex(idx);
    const sample = useCase.sampleInputs[idx];
    if (sample) {
      setInputText(sample.content);
    }
  };

  const runDemoSummarize = () => {
    setIsProcessing(true);
    setTimeout(() => {
      let result = '';
      if (selectedSampleIndex === 0) {
        result = `Confidential Summary:\n## Executive Financial & Operations Summary\n- Revenue Growth: +18% Q/Q with On-Device Processing.\n- Key Action Item: Standardize local LLM processing across team Macs.\n- Data Handling: processed locally in this demo; no network call is made.`;
      } else if (selectedSampleIndex === 1) {
        result = `Confidential Summary:\n## Data Handling Policy Highlights\n- On-Device Processing: All customer data processing restricted to local Mac memory.\n- Local Only: the policy keeps records on the device.`;
      } else {
        result = `Confidential Summary:\n## Product Engineering Architecture Summary\n- On-Device Processing: Complete client-side operation.\n- No Network Calls: the demo output is prepared in the browser.`;
      }

      setSummaryOutput(result);
      setIsProcessing(false);
    }, 400);
  };

  const runLiveSummarize = async () => {
    if (!matchingTag) {
      setLiveError('Matching model not installed in Ollama. Falling back to Demo mode.');
      setMode('demo');
      runDemoSummarize();
      return;
    }

    setIsProcessing(true);
    setSummaryOutput('');
    setLiveError(null);

    const prompt = `Summarize the following confidential document concisely into bullet points and executive highlights:\n\n${inputText}`;

    try {
      await generateStream(
        matchingTag,
        prompt,
        (chunk) => {
          setSummaryOutput((prev) => prev + chunk);
        },
        { systemPrompt: 'You are an executive summary assistant running locally on Apple Silicon.' }
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn('Live Ollama streaming failed:', errorMessage);
      setLiveError('Live streaming connection lost. Falling back to interactive demo preview.');
      setMode('demo');
      runDemoSummarize();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSummarize = () => {
    if (!inputText.trim()) return;
    if (mode === 'live' && isLiveAvailable) {
      runLiveSummarize();
    } else {
      runDemoSummarize();
    }
  };

  return (
    <SharedPlayground
      containerTestId="doc-summarizing-playground"
      title="Confidential Document Summarizing Playground"
      subtitle="Extract executive bullet points and key takeaways from sensitive documents without cloud uploads."
      icon={<FileText className="w-5 h-5 text-indigo-400" />}
      mode={mode}
      onModeChange={setMode}
      isLiveAvailable={isLiveAvailable}
      engineAvailable={available}
      modelTag={matchingTag || useCase.recommendedModel}
      substituteNote={substituteNote}
      appName="AnythingLLM"
      appUrl="https://anythingllm.com"
      liveError={liveError}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Sample Document Chips & Custom Input */}
        <div className="space-y-4">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            1. Select Sample Confidential Document or Type Text:
          </label>

          <div className="space-y-2">
            {useCase.sampleInputs.map((sample, idx) => (
              <button
                key={sample.id}
                type="button"
                data-testid={`doc-sample-chip-${idx}`}
                onClick={() => handleSelectSample(idx)}
                className={`w-full text-left p-3 rounded-xl border text-xs transition-all cursor-pointer min-h-[44px] flex items-center justify-between gap-3 ${
                  selectedSampleIndex === idx
                    ? 'bg-indigo-950/70 border-indigo-500 text-indigo-200 font-semibold shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <div data-testid={`sample-input-btn-${idx}`} className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>{sample.label}</span>
                </div>
                {selectedSampleIndex === idx && <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium block">
              Document Text Context:
            </label>
            <textarea
              data-testid="doc-input-textarea"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste confidential text or document contents here..."
              rows={6}
              className="w-full min-h-[140px] bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
          </div>

          <button
            type="button"
            data-testid="summarize-btn"
            onClick={handleSummarize}
            disabled={isProcessing || !inputText.trim()}
            className="w-full min-h-[44px] px-5 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span data-testid="run-playground-btn" className="flex items-center gap-2">
              {isProcessing ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin text-indigo-200" />
                  <span>
                    {mode === 'live'
                      ? `Streaming Live Tokens from Ollama (${matchingTag})...`
                      : 'Summarizing Privately On Apple Silicon...'}
                  </span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>
                    {mode === 'live'
                      ? 'Run Live Ollama Summarization'
                      : 'Summarize Privately (Demo Mode)'}
                  </span>
                </>
              )}
            </span>
          </button>
        </div>

        {/* Right Column: Formatted Executive Summary Output */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              2. Executive Summary Output:
            </label>
            <span
              data-testid="air-gapped-badge"
              className="text-[11px] text-emerald-400 font-semibold px-2.5 py-1 bg-emerald-950/80 border border-emerald-800/80 rounded-full flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>{mode === 'live' ? 'Live Local Ollama Engine' : '100% Air-Gapped Local Execution'}</span>
            </span>
          </div>

          <div
            data-testid="summary-output"
            className="w-full min-h-[280px] bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-200 text-sm leading-relaxed whitespace-pre-wrap flex flex-col justify-between"
          >
            <div data-testid="playground-output-container">
              {summaryOutput}
              {isProcessing && mode === 'live' && (
                <span className="inline-block w-2 h-4 ml-1 bg-emerald-400 animate-pulse" />
              )}
            </div>

            <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Mode: {mode === 'live' ? `Live Streaming (${matchingTag})` : 'Interactive Demo'}
              </span>
              <span>Model: {matchingTag || 'Llama 3.2 (3B)'}</span>
            </div>
          </div>
        </div>
      </div>
    </SharedPlayground>
  );
};
