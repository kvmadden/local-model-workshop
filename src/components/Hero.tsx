import React from 'react';
import { ShieldCheck, Cpu, Sparkles, Zap, Lock } from 'lucide-react';

export const Hero: React.FC = () => {
  return (
    <section
      data-testid="hero-section"
      className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-sm space-y-6"
    >
      {/* Background Subtle Ambient Light Accent */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-4xl space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-950/80 border border-indigo-700/60 rounded-full text-indigo-300 text-xs font-semibold shadow-sm">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>Local Model Workshop</span>
        </div>

        <h2
          data-testid="hero-headline"
          className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-100 leading-tight"
        >
          Small Local Models on Your Mac, Without Writing Code
        </h2>

        <p
          data-testid="hero-subtitle"
          className="text-base text-slate-300 max-w-3xl leading-relaxed font-normal"
        >
          Find small models that fit your Mac, match everyday tasks to desktop apps, and chain prompt steps against a local Ollama or a built-in mock.
        </p>
      </div>

      {/* Trust & Hardware Feature Badges Grid */}
      <div
        data-testid="hero-badges-container"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative z-10 pt-2"
      >
        <div
          data-testid="hero-badge-privacy"
          className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 text-slate-200"
        >
          <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <div className="text-xs font-bold text-slate-100">Local by Default</div>
            <div className="text-[10px] text-slate-400">Mock or localhost Ollama</div>
          </div>
        </div>

        <div
          data-testid="hero-badge-gpu"
          className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 text-slate-200"
        >
          <Cpu className="w-4 h-4 text-indigo-400 shrink-0" />
          <div>
            <div className="text-xs font-bold text-slate-100">Apple Silicon GPU</div>
            <div className="text-[10px] text-slate-400">Metal via Ollama or apps</div>
          </div>
        </div>

        <div
          data-testid="hero-badge-silicon"
          className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 text-slate-200"
        >
          <Zap className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <div className="text-xs font-bold text-slate-100">M1–M4 Chips</div>
            <div className="text-[10px] text-slate-400">Bandwidth-based estimates</div>
          </div>
        </div>

        <div
          data-testid="hero-badge-zero-code"
          className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 text-slate-200"
        >
          <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
          <div>
            <div className="text-xs font-bold text-slate-100">No Code</div>
            <div className="text-[10px] text-slate-400">Point-and-click flows</div>
          </div>
        </div>
      </div>
    </section>
  );
};
