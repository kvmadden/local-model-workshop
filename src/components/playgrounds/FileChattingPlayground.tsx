import React, { useState } from 'react';
import { MessageSquare, Send, BookOpen, CheckCircle2, ShieldCheck, FileText } from 'lucide-react';
import { USE_CASES_DATA } from '../../data/useCases';
import { chatStream } from '../../services/ollamaService';
import { usePlaygroundState } from '../../hooks/usePlaygroundState';
import { SharedPlayground } from './SharedPlayground';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  citation?: string;
}

export const FileChattingPlayground: React.FC = () => {
  const useCase = USE_CASES_DATA['file-chat'];
  const {
    available,
    matchingTag,
    substituteNote,
    isLiveAvailable,
    mode,
    setMode,
    selectedSampleIndex: selectedDocIndex,
    setSelectedSampleIndex: setSelectedDocIndex,
    isProcessing,
    setIsProcessing,
    liveError,
    setLiveError,
  } = usePlaygroundState({ modelName: 'Qwen 2.5 (7B)' });

  const presetQueries = [
    'What local models run on 8GB RAM Macs?',
    'Which Mac apps support local model execution?',
    'How do local models protect my document privacy?',
  ];

  const [userQuery, setUserQuery] = useState<string>(presetQueries[0]);

  const activeDoc = useCase.sampleInputs[selectedDocIndex] || useCase.sampleInputs[0];

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-init',
      sender: 'assistant',
      text: `Hello! I am connected to your selected local document: "${activeDoc.label}" via Llama 3.2 model. Ask me any question about its contents.`,
      citation: `Document Reference: ${activeDoc.label}`,
    },
  ]);

  const handleSelectDoc = (idx: number) => {
    setSelectedDocIndex(idx);
    const doc = useCase.sampleInputs[idx];
    if (doc) {
      setChatMessages([
        {
          id: `msg-switch-${Date.now()}`,
          sender: 'assistant',
          text: `Switched local context to "${doc.label}". Ready for questions!`,
          citation: `Document Reference: ${doc.label}`,
        },
      ]);
    }
  };

  const handleSelectQueryChip = (queryText: string) => {
    setUserQuery(queryText);
  };

  const runDemoQuery = (query: string) => {
    setIsProcessing(true);
    setTimeout(() => {
      let answerText = '';
      let citationText = `[Source Citation: ${activeDoc.label}]`;

      if (query.toLowerCase().includes('8gb')) {
        answerText = 'Direct Answer from Local Context:\nBased on the document without exposing sensitive content to public servers, Macs with 8GB RAM run 3B parameter models like Llama 3.2 (3B) and Whisper (Large-v3 Turbo) smoothly.';
      } else if (query.toLowerCase().includes('mac apps') || query.toLowerCase().includes('apps')) {
        answerText = 'Direct Answer from Local Context:\nBased on the document without exposing sensitive content to public servers, supported zero-code Mac desktop apps include LM Studio, MacWhisper, AnythingLLM, and Ollama.';
      } else if (query.toLowerCase().includes('privacy') || query.toLowerCase().includes('guarantee')) {
        answerText = 'Direct Answer from Local Context:\nBased on the document without exposing sensitive content to public servers, Local model execution keeps 100% of document embeddings and chat memory inside local Apple Silicon RAM with zero cloud network requests.';
      } else {
        answerText = `Direct Answer from Local Context:\nBased on "${activeDoc.label}" without exposing sensitive content to public servers:\n${activeDoc.content}\n\nAll answers are generated 100% on-device on Apple Silicon GPU.`;
      }

      const assistantMsg: ChatMessage = {
        id: `msg-assistant-${Date.now()}`,
        sender: 'assistant',
        text: answerText,
        citation: citationText,
      };

      setChatMessages((prev) => [...prev, assistantMsg]);
      setIsProcessing(false);
    }, 400);
  };

  const runLiveQuery = async (query: string) => {
    if (!matchingTag) {
      setLiveError('Qwen 2.5 model not installed in Ollama. Falling back to Demo mode.');
      setMode('demo');
      runDemoQuery(query);
      return;
    }

    setIsProcessing(true);
    setLiveError(null);

    const assistantMsgId = `msg-assistant-live-${Date.now()}`;
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      sender: 'assistant',
      text: '',
      citation: `[Source Citation: ${activeDoc.label}]`,
    };

    setChatMessages((prev) => [...prev, initialAssistantMsg]);

    const messagesPayload = [
      {
        role: 'system',
        content: `You are a helpful document assistant. Context document "${activeDoc.label}": "${activeDoc.content}".`,
      },
      ...chatMessages
        .filter((m) => m.id !== 'msg-init' && !m.id.startsWith('msg-switch'))
        .map((m) => ({
          role: m.sender,
          content: m.text,
        })),
      { role: 'user', content: query },
    ];

    try {
      await chatStream(
        matchingTag,
        messagesPayload,
        (chunk) => {
          setChatMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, text: msg.text + chunk }
                : msg
            )
          );
        }
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn('Live chat streaming failed:', errorMessage);
      setLiveError('Live streaming connection lost. Falling back to interactive demo.');
      setMode('demo');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendQuery = (textToSend?: string) => {
    const query = (textToSend || userQuery).trim();
    if (!query || isProcessing) return;

    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: query,
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setUserQuery('');

    if (mode === 'live' && isLiveAvailable) {
      runLiveQuery(query);
    } else {
      runDemoQuery(query);
    }
  };

  return (
    <SharedPlayground
      containerTestId="file-chatting-playground"
      title="File Chatting Playground"
      subtitle="Converse directly with local files and knowledge repositories in real time."
      icon={<MessageSquare className="w-5 h-5 text-indigo-400" />}
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
      {/* Document Selector Chips */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
          1. Select Local Document to Chat With:
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {useCase.sampleInputs.map((sample, idx) => (
            <button
              key={sample.id}
              type="button"
              data-testid={`doc-selector-chip-${idx}`}
              onClick={() => handleSelectDoc(idx)}
              className={`p-3 rounded-xl border text-xs text-left transition-all cursor-pointer min-h-[44px] flex items-center justify-between gap-2 ${
                selectedDocIndex === idx
                  ? 'bg-indigo-950/70 border-indigo-500 text-indigo-200 font-semibold shadow-md'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <div data-testid={`sample-input-btn-${idx}`} className="flex items-center gap-2 truncate w-full">
                <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="truncate">{sample.label}</span>
              </div>
              {selectedDocIndex === idx && <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* Recommended Query Chips */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-400 block">
          Quick Question Suggestions:
        </span>
        <div className="flex flex-wrap gap-2">
          {presetQueries.map((qText, idx) => (
            <button
              key={idx}
              type="button"
              data-testid={`query-chip-${idx}`}
              onClick={() => handleSelectQueryChip(qText)}
              className="text-xs bg-slate-950 hover:bg-slate-850 text-indigo-300 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              "{qText}"
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Local Q&A Feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            2. Local Interactive Q&A Feed:
          </label>
          <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            {mode === 'live' ? `Live Streaming (${matchingTag})` : 'Local Metal Acceleration'}
          </span>
        </div>

        <div
          data-testid="qa-feed-container"
          className="w-full min-h-[300px] max-h-[450px] overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4 text-sm"
        >
          <div data-testid="playground-output-container" className="space-y-4">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col space-y-1.5 ${
                  msg.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="text-[11px] text-slate-400 px-1 font-medium">
                  {msg.sender === 'user' ? 'You' : `Local ${matchingTag || 'Qwen 2.5'} Model`}
                </div>

                <div
                  className={`p-3.5 rounded-2xl max-w-xl leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none shadow-md'
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none shadow-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap text-sm">{msg.text}</div>

                  {msg.citation && (
                    <div
                      data-testid="document-citation"
                      className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-emerald-400 font-semibold flex items-center gap-1.5"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>{msg.citation}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {isProcessing && (
            <div className="flex flex-col items-start space-y-1">
              <div className="text-[11px] text-slate-400 px-1 font-medium">
                Local {matchingTag || 'Qwen 2.5'} Model
              </div>
              <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl rounded-bl-none text-slate-400 text-xs italic flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                {mode === 'live'
                  ? 'Streaming live response tokens from Ollama...'
                  : 'Retrieving local context & generating on Apple Silicon...'}
              </div>
            </div>
          )}
        </div>

        {/* Query Input Bar */}
        <div className="flex items-center gap-2">
          <textarea
            data-testid="chat-input-textarea"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendQuery();
              }
            }}
            placeholder="Type your question about the local document..."
            rows={1}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none min-h-[44px]"
          />

          <button
            type="button"
            data-testid="send-query-btn"
            onClick={() => handleSendQuery()}
            disabled={isProcessing || !userQuery.trim()}
            className="min-h-[44px] px-5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-950/50 transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span data-testid="run-playground-btn" className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline text-xs">Send Query</span>
            </span>
          </button>
        </div>
      </div>
    </SharedPlayground>
  );
};
