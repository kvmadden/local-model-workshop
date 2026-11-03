import React, { useState } from 'react';
import { Mic, Play, Pause, Download, Volume2, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { USE_CASES_DATA } from '../../data/useCases';
import { generateStream } from '../../services/ollamaService';
import { usePlaygroundState } from '../../hooks/usePlaygroundState';
import { SharedPlayground } from './SharedPlayground';

export const VoiceTranscriptionPlayground: React.FC = () => {
  const useCase = USE_CASES_DATA['transcription'];
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
  } = usePlaygroundState({ modelName: 'Whisper (Large-v3)' });

  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [transcriptOutput, setTranscriptOutput] = useState<string>(useCase.defaultOutput);
  const [exportFeedback, setExportFeedback] = useState<boolean>(false);

  const currentSample = useCase.sampleInputs[selectedSampleIndex] || useCase.sampleInputs[0];

  const handleSelectSample = (idx: number) => {
    setSelectedSampleIndex(idx);
    setIsPlayingAudio(false);
  };

  const runDemoTranscribe = () => {
    setIsProcessing(true);
    setIsPlayingAudio(true);
    setTimeout(() => {
      let result = '';
      if (selectedSampleIndex === 0) {
        result = `Local Transcription Result:\n[00:00:01] Speaker 1: "Alright everyone let us review the Q3 product roadmap..."\n[00:00:05] Speaker 1: "...local model workshop must be completed on Apple Silicon GPU."\n[00:00:09] Speaker 2: "Agreed, handling UI styling and non-technical playfulness now."`;
      } else if (selectedSampleIndex === 1) {
        result = `[00:00:01] Speaker 1 (Client Lead): "For our client workflow, all document processing stays local on Apple Silicon..."\n[00:00:06] Speaker 1 (Client Lead): "...no external cloud APIs or data leaks under any circumstances."`;
      } else {
        result = `[00:00:01] Speaker 1 (Host): "Welcome back to Local AI Weekly episode 42!"\n[00:00:04] Speaker 1 (Host): "Today we explore 3B and 8B local models running on Mac M-series chips with zero monthly fees."`;
      }

      setTranscriptOutput(result);
      setIsProcessing(false);
    }, 400);
  };

  const runLiveTranscribe = async () => {
    if (!matchingTag) {
      setLiveError('No matching local model found in Ollama. Falling back to Demo mode.');
      setMode('demo');
      runDemoTranscribe();
      return;
    }

    setIsProcessing(true);
    setIsPlayingAudio(true);
    setTranscriptOutput('');
    setLiveError(null);

    const prompt = `Convert the following audio transcript notes into a clean, timestamped speaker transcript format:\n\nAudio sample text: "${currentSample.content}"`;

    try {
      await generateStream(
        matchingTag,
        prompt,
        (chunk) => {
          setTranscriptOutput((prev) => prev + chunk);
        },
        { systemPrompt: 'You are an accurate voice transcription and formatting engine running on local Mac GPU.' }
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn('Live transcription streaming failed:', errorMessage);
      setLiveError('Live streaming connection lost. Falling back to interactive demo.');
      setMode('demo');
      runDemoTranscribe();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunTranscribe = () => {
    if (mode === 'live' && isLiveAvailable) {
      runLiveTranscribe();
    } else {
      runDemoTranscribe();
    }
  };

  const handleExport = () => {
    // Write the transcript shown on screen to a real .txt file.
    const blob = new Blob([transcriptOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'transcript.txt';
    link.click();
    URL.revokeObjectURL(url);
    setExportFeedback(true);
    setTimeout(() => setExportFeedback(false), 2000);
  };

  return (
    <SharedPlayground
      containerTestId="voice-transcription-playground"
      title="Voice Transcription Playground"
      subtitle="Turn a rough transcript into a clean, speaker-labelled one. This panel uses sample transcript text, not audio. Audio needs a speech model such as Whisper."
      icon={<Mic className="w-5 h-5 text-indigo-400" />}
      mode={mode}
      onModeChange={setMode}
      isLiveAvailable={isLiveAvailable}
      engineAvailable={available}
      modelTag={matchingTag || useCase.recommendedModel}
      substituteNote={substituteNote}
      appName="MacWhisper"
      appUrl="https://goodsnooze.gumroad.com/l/macwhisper"
      liveError={liveError}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Sample Playback & Waveform */}
        <div className="space-y-4">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            1. Select Sample Audio Track:
          </label>

          <div className="space-y-2">
            {useCase.sampleInputs.map((sample, idx) => (
              <button
                key={sample.id}
                type="button"
                data-testid={`audio-sample-chip-${idx}`}
                onClick={() => handleSelectSample(idx)}
                className={`w-full text-left p-3 rounded-xl border text-xs transition-all cursor-pointer min-h-[44px] flex items-center justify-between gap-3 ${
                  selectedSampleIndex === idx
                    ? 'bg-indigo-950/70 border-indigo-500 text-indigo-200 font-semibold shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <div data-testid={`sample-input-btn-${idx}`} className="flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>{sample.label}</span>
                </div>
                {selectedSampleIndex === idx && <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />}
              </button>
            ))}
          </div>

          {/* Audio Waveform Visualizer */}
          <div
            data-testid="audio-waveform-visualizer"
            className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                Audio Waveform Preview
              </span>
              <span className="text-[11px] font-semibold text-emerald-400">Apple Metal Accelerated</span>
            </div>

            <div className="h-16 flex items-center justify-center gap-1 bg-slate-900/80 rounded-lg p-3 border border-slate-800/80">
              {[40, 65, 30, 85, 95, 45, 70, 35, 90, 60, 40, 80, 100, 55, 75, 30, 85, 50, 65, 40].map((h, i) => (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-300 ${
                    isPlayingAudio || isProcessing ? 'bg-indigo-400 animate-pulse' : 'bg-slate-700'
                  }`}
                  style={{ height: `${isPlayingAudio || isProcessing ? Math.max(20, (h * (i % 3 + 1)) % 100) : h}%` }}
                />
              ))}
            </div>

            <div className="text-[11px] text-slate-400 text-center">
              Sample Text Preview: "{currentSample.content}"
            </div>
          </div>

          {/* Action Transcribe Button */}
          <button
            type="button"
            data-testid="transcribe-btn"
            onClick={handleRunTranscribe}
            disabled={isProcessing}
            className="w-full min-h-[44px] px-5 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 transition-colors cursor-pointer"
          >
            <span data-testid="run-playground-btn" className="flex items-center gap-2">
              {isProcessing ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin text-indigo-200" />
                  <span>
                    {mode === 'live'
                      ? `Streaming Live Transcript via Ollama (${matchingTag})...`
                      : 'Transcribing Audio On-Device...'}
                  </span>
                </>
              ) : isPlayingAudio ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>{mode === 'live' ? 'Re-run Live Transcription' : 'Re-run Voice Transcription'}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>{mode === 'live' ? 'Run Live Transcribe' : 'Play & Transcribe Audio'}</span>
                </>
              )}
            </span>
          </button>
        </div>

        {/* Right Column: Live Timestamped Output */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              2. Timestamped Speaker Transcript:
            </label>
            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              {mode === 'live' ? 'Local Ollama on this machine (text only)' : 'Demo sample, no audio processed'}
            </span>
          </div>

          <div
            data-testid="transcript-output"
            className="w-full min-h-[260px] bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-200 text-sm leading-relaxed whitespace-pre-wrap flex flex-col justify-between"
          >
            <div data-testid="playground-output-container">
              {transcriptOutput}
              {isProcessing && mode === 'live' && (
                <span className="inline-block w-2 h-4 ml-1 bg-emerald-400 animate-pulse" />
              )}
            </div>

            <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Engine: {mode === 'live' ? `Ollama (${matchingTag}), text cleanup` : 'none, demo sample'}</span>
              <span>Status: {isProcessing ? 'Processing' : 'Complete'}</span>
            </div>
          </div>

          {/* Export Transcript Action */}
          <button
            type="button"
            data-testid="export-transcript-btn"
            onClick={handleExport}
            className="w-full min-h-[44px] px-4 py-2.5 bg-slate-900 hover:bg-slate-850 active:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Download className="w-4 h-4 text-indigo-400" />
            <span>{exportFeedback ? 'Transcript Exported!' : 'Export Transcript (.TXT)'}</span>
          </button>
        </div>
      </div>
    </SharedPlayground>
  );
};
