import { useState, useEffect } from 'react';
import { useOllamaStatus } from './useOllamaStatus';

export interface UsePlaygroundStateOptions {
  modelName: string;
}

export function usePlaygroundState({ modelName }: UsePlaygroundStateOptions) {
  const { available, models, resolveModel } = useOllamaStatus();

  // A playground goes live ONLY on the model it asks for.
  //
  // This used to fall back to models[0] whenever the requested model was
  // missing, and return that substitute to callers under the name `matchingTag`
  // — which made every `if (!matchingTag)` demo-guard downstream dead code,
  // because it was never null while ANY model was installed.
  //
  // The result was not a degraded answer, it was a false one. With only
  // llama3.2:3b present, the Voice Transcription playground badged itself
  // "Live Ollama Mode" and had a 3B general model INVENT a speaker-labelled,
  // timestamped transcript. File Chatting, which wants Qwen 2.5, answered "I
  // don't have specific information" about its own context document. A wrong
  // model presented as the right one is worse than an honest demo sample.
  //
  // `substituteAvailable` is kept so a caller can offer the swap deliberately
  // and say which model would actually run — the swap was never the problem,
  // the silence was.
  //
  // That silence survived one layer lower for a while. The resolver matched on
  // FAMILY alone, so with qwen3.6 installed and no qwen2.5, a "Qwen 2.5 (7B)"
  // request came back as `qwen3.6:latest` — and arrived here already disguised
  // as `matchingTag`, below where the guard above operates. File Chatting went
  // live on a different model with nothing on screen saying so. The resolver
  // now reports `exact`, and only an exact match may be called a match.
  //
  // A same-family near-match is not discarded, it is DEMOTED into the
  // substitute slot, which is a strict improvement on what that slot used to
  // hold: `models[0]`, an arbitrary first-installed model that on this machine
  // offered gemma4:26b as a stand-in for Qwen.
  const resolution = resolveModel(modelName);
  const matchingTag = resolution?.exact ? resolution.tag : null;
  const nearMatch = resolution && !resolution.exact ? resolution : null;
  const substituteAvailable = matchingTag
    ? null
    : nearMatch?.tag ?? (models.length > 0 ? models[0].name : null);
  const isLiveAvailable = available && Boolean(matchingTag);

  // The disclosure itself, assembled here so all four playgrounds cannot word
  // it four different ways, and so `substituteNote !== null` is the single way
  // to ask "is the substitute actually related to what I wanted?".
  //
  // Only the same-family near-match is surfaced: "you asked for Qwen 2.5,
  // qwen3.6 is installed" is worth acting on, whereas "you asked for Qwen 2.5,
  // gemma4:26b is installed" is noise dressed as an offer. The arbitrary
  // substitute stays available via `substituteAvailable`; it just gets no
  // banner.
  //
  // `mismatch` travels with it because the banner has to say something TRUE
  // about a near-match, and "a different version" is only true of one of the
  // three ways a same-family tag can fail to be the requested model.
  const substituteNote =
    nearMatch !== null
      ? { requested: modelName, installed: nearMatch.tag, mismatch: nearMatch.mismatch }
      : null;

  // `mode` is DERIVED, never raw state, so that live mode is structurally
  // impossible without live capability.
  //
  // Every playground renders its labels off `mode === 'live'` — "Live Local
  // Ollama Streaming", `Engine: Ollama (${matchingTag})`, "Streaming Live
  // Transcript via Ollama" — and SharedPlayground suppresses the demo banner
  // whenever mode is not 'demo'. Meanwhile each `handleRun*` falls back to its
  // hardcoded `runDemo*()` sample when `isLiveAvailable` is false.
  //
  // Holding `mode` as plain state let those two facts combine: clicking the
  // "Live Ollama Mode" toggle while Ollama was absent set mode='live', the
  // demo banner disappeared, and the next run painted a hardcoded synthetic
  // transcript under live labels naming a model that was never contacted.
  // That is the same class of falsehood as the models[0] substitution fixed
  // above — synthetic output presented as real model output.
  //
  // Deriving it means no ordering, no race, and no future caller can reopen
  // the hole: `mode === 'live'` implies `isLiveAvailable`, which implies a
  // non-null `matchingTag`.
  const [requestedMode, setRequestedMode] = useState<'live' | 'demo'>('demo');
  const mode: 'live' | 'demo' = isLiveAvailable && requestedMode === 'live' ? 'live' : 'demo';

  const [selectedSampleIndex, setSelectedSampleIndex] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    setRequestedMode(isLiveAvailable ? 'live' : 'demo');
  }, [isLiveAvailable]);

  return {
    available,
    // The REAL match, not a substitute. Callers' `if (!matchingTag)` guards
    // depend on this being null when the requested model is absent.
    matchingTag,
    // A model that is installed but is NOT what was asked for. Name it when
    // offering it; it is not interchangeable with `matchingTag`.
    substituteAvailable,
    substituteNote,
    isLiveAvailable,
    mode,
    // Callers may request live; only `isLiveAvailable` grants it.
    setMode: setRequestedMode,
    selectedSampleIndex,
    setSelectedSampleIndex,
    isProcessing,
    setIsProcessing,
    liveError,
    setLiveError,
  };
}
