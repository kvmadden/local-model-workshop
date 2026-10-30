import React, { useState } from 'react';
import { Command, Mic, FileText, CheckCircle2, Copy, Check, ShieldCheck, Sparkles, AppWindow, FileCode2 } from 'lucide-react';

interface ShortcutBlueprint {
  id: string;
  title: string;
  trigger: string;
  shortcutHotkey: string;
  appPairing: string;
  modelPairing: string;
  description: string;
  steps: string[];
  sampleCommand: string;
}

const SHORTCUTS_DATA: ShortcutBlueprint[] = [
  {
    id: 'dictation-hotkey',
    title: 'Global Dictation Cleanup Hotkey',
    trigger: 'Global Keyboard Hotkey (Cmd+Opt+V)',
    shortcutHotkey: '⌥⌘V',
    appPairing: 'Ollama & Apple Shortcuts (macOS Sequoia / macOS 26)',
    modelPairing: 'Phi-3.5 Mini (3.8B)',
    description: 'Press Cmd+Opt+V anywhere in macOS (Mail, Notes, Slack) to instantly clean up rough spoken dictation via local LLM.',
    steps: [
      'Open the macOS Shortcuts app (pre-installed on macOS Sequoia & macOS 26).',
      'Click "+" in the Shortcuts Gallery to create a new Shortcut named "Clean Up Dictation".',
      'From the macOS Sequoia Action Library, drag in Action: "Get Selected Text" → "Get Contents of URL" (POST request to http://localhost:11434/api/generate).',
      'Add Action: "Copy to Clipboard" & "Paste".',
      'In Shortcut Inspector settings under "Quick Actions", check "Use as Quick Action" and assign global hotkey ⌥⌘V.'
    ],
    sampleCommand: 'curl -s http://localhost:11434/api/generate -d \'{"model": "phi3.5", "prompt": "Clean up: [Selected Text]"}\''
  },
  {
    id: 'finder-quick-action',
    title: 'Finder Quick Action: Audio Transcription',
    trigger: 'Right-Click Any Audio File in Finder',
    shortcutHotkey: 'Right-Click → Quick Actions',
    appPairing: 'MacWhisper / Whisper CLI (macOS Sequoia)',
    modelPairing: 'Whisper (Large-v3)',
    description: 'Right-click any MP3, WAV, or MOV file in macOS Finder to transcribe meeting recordings offline in seconds.',
    steps: [
      'Open macOS Shortcuts app → Click "+" to create a new macOS Sequoia Quick Action.',
      'Set input type to "Audio files & Video files in Finder" in the macOS 26 Action Library.',
      'Add Action: "Run Shell Script" configured with MacWhisper CLI or local whisper binary.',
      'Add Action: "Save File" to your Downloads folder as formatted Markdown.',
      'Access anytime by right-clicking audio files in macOS Finder under Quick Actions.'
    ],
    sampleCommand: 'macwhisper --file "$1" --model large-v3 --output ~/Downloads/'
  },
  {
    id: 'menu-bar-pdf-summarizer',
    title: 'Menu Bar PDF Drop Summarizer',
    trigger: 'macOS Menu Bar Drag & Drop',
    shortcutHotkey: 'Menu Bar Icon',
    appPairing: 'AnythingLLM / Ollama (macOS Sequoia)',
    modelPairing: 'Llama 3.2 (3B)',
    description: 'Drag any confidential PDF or report onto your Mac menu bar icon to generate an air-gapped executive summary.',
    steps: [
      'In macOS Shortcuts app Inspector, check "Pin in Menu Bar".',
      'Add Action: "Extract Text from PDF" from the macOS Sequoia PDF Action category.',
      'Add Action: "Send Request to Local Model Endpoint" (Llama 3.2 3B).',
      'Add Action: "Show Result in Notification Center" & copy summary to clipboard.',
      'Drop any confidential doc onto the menu bar icon for instant local summary.'
    ],
    sampleCommand: 'curl -s http://localhost:11434/api/generate -d \'{"model": "llama3.2", "prompt": "Summarize PDF: [Selected Document Text]"}\''
  }
];

export const ShortcutsStudio: React.FC = () => {
  const [selectedBlueprint, setSelectedBlueprint] = useState<ShortcutBlueprint>(SHORTCUTS_DATA[0]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCmd = (cmd: string, id: string) => {
    navigator.clipboard?.writeText(cmd);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div data-testid="shortcuts-studio-container" className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400">
          <Command className="w-4 h-4 text-indigo-400" />
          <span>macOS Sequoia / macOS 26 Automation & Menu Bar Recipes</span>
        </div>
        <h2 data-testid="shortcuts-heading" className="text-2xl font-extrabold text-slate-100 tracking-tight">
          1-Click Apple Shortcuts & Global Hotkeys
        </h2>
        <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
          Trigger local AI models directly from your Mac menu bar, Finder right-click menu, or global hotkeys (like <span className="text-indigo-300 bg-slate-950 px-1.5 py-0.5 rounded font-mono font-bold">⌥⌘V</span>) with zero coding required.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Recipe Selector Chips */}
        <div className="lg:col-span-5 space-y-3">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            Select a macOS Automation Recipe:
          </label>

          <div className="space-y-3">
            {SHORTCUTS_DATA.map((bp) => {
              const isSelected = selectedBlueprint.id === bp.id;
              return (
                <button
                  key={bp.id}
                  type="button"
                  data-testid={`shortcut-blueprint-btn-${bp.id}`}
                  onClick={() => setSelectedBlueprint(bp)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer min-h-[44px] space-y-2 ${
                    isSelected
                      ? 'bg-indigo-950/80 border-indigo-500 text-indigo-100 shadow-xl'
                      : 'bg-slate-900 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-sm text-slate-100 flex items-center gap-2">
                      {bp.id === 'dictation-hotkey' && <Mic className="w-4 h-4 text-indigo-400 shrink-0" />}
                      {bp.id === 'finder-quick-action' && <FileText className="w-4 h-4 text-emerald-400 shrink-0" />}
                      {bp.id === 'menu-bar-pdf-summarizer' && <AppWindow className="w-4 h-4 text-sky-400 shrink-0" />}
                      <span>{bp.title}</span>
                    </div>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />}
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">{bp.description}</p>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px]">
                    <span className="text-slate-400">Trigger:</span>
                    <span className="font-mono font-bold text-indigo-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {bp.shortcutHotkey}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Interactive Recipe Setup Guide */}
        <div className="lg:col-span-7 space-y-5">
          <div
            data-testid="shortcut-details-card"
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6"
          >
            {/* Top Spec Header */}
            <div className="border-b border-slate-800 pb-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-0.5 rounded flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>100% Offline macOS Sequoia Native Automation</span>
                </span>
                <span className="text-xs font-mono font-bold text-indigo-300 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                  {selectedBlueprint.shortcutHotkey}
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-100">{selectedBlueprint.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{selectedBlueprint.description}</p>
            </div>

            {/* App & Model Pairing Badge Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block">App Integration:</span>
                <span className="font-bold text-indigo-300">{selectedBlueprint.appPairing}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Recommended Model:</span>
                <span className="font-bold text-emerald-300">{selectedBlueprint.modelPairing}</span>
              </div>
            </div>

            {/* Installation Steps for macOS Sequoia / macOS 26 */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Zero-Code Setup Steps (macOS Sequoia Shortcuts UI Flow)</span>
              </h4>

              <ol className="space-y-2.5">
                {selectedBlueprint.steps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-300">
                    <span className="w-5 h-5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* REST JSON Parameter Note */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs text-slate-300">
              <div className="flex items-center gap-2 font-bold text-indigo-300">
                <FileCode2 className="w-4 h-4 text-indigo-400" />
                <span>REST JSON Parameter Note:</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                The automation payload sends standard REST JSON parameters (<span className="text-indigo-200 font-mono">"model"</span> and <span className="text-indigo-200 font-mono">"prompt"</span>) directly to your local model endpoint (<span className="text-indigo-200 font-mono">http://localhost:11434/api/generate</span>). The placeholder <span className="text-emerald-300 font-semibold">[Selected Text]</span> is automatically substituted by macOS Shortcuts at execution time.
              </p>
            </div>

            {/* Copy Command Payload Bar */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-400 font-medium">
                <span>Local Execution Payload Command:</span>
                <span className="text-[10px] text-slate-400">Copy to paste into Shortcuts app</span>
              </div>

              <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800 gap-2">
                <span className="text-xs font-mono text-indigo-200 truncate min-w-0 font-semibold">
                  {selectedBlueprint.sampleCommand}
                </span>
                <button
                  type="button"
                  data-testid={`copy-blueprint-cmd-${selectedBlueprint.id}`}
                  onClick={() => handleCopyCmd(selectedBlueprint.sampleCommand, selectedBlueprint.id)}
                  className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  {copiedId === selectedBlueprint.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Payload</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
