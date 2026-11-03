import React, { useState } from 'react';
import { HardDrive, Zap, ShieldCheck, CheckCircle2, AlertTriangle, Sliders } from 'lucide-react';
import { MAC_CHIPS, RAM_OPTIONS } from '../data/hardwareData';
import { MODELS_DATA, getModelVramGB } from '../data/models';


export const HardwareAdvisor: React.FC = () => {
  const [selectedChipId, setSelectedChipId] = useState<string>('m4-pro');
  const [selectedRamGB, setSelectedRamGB] = useState<number>(24);
  const [generationFilter, setGenerationFilter] = useState<'All' | 'M1' | 'M2' | 'M3' | 'M4'>('All');

  const selectedChip = MAC_CHIPS.find((c) => c.id === selectedChipId) || MAC_CHIPS[0];

  const filteredChips = MAC_CHIPS.filter((c) => {
    if (generationFilter === 'All') return true;
    return c.generation === generationFilter;
  });

  // Calculate VRAM budget (Metal GPU can use up to ~75% of unified memory)
  const usableVramGB = Math.round(selectedRamGB * 0.75 * 10) / 10;
  const systemReservedGB = Math.round((selectedRamGB - usableVramGB) * 10) / 10;

  // Helper to estimate token speed based on memory bandwidth
  const estimateTokensPerSec = (modelSizeGB: number) => {
    if (modelSizeGB <= 0) return 0;
    // Effective bandwidth efficiency ~70%
    const speed = (selectedChip.memoryBandwidthGBs * 0.65) / modelSizeGB;
    return Math.min(150, Math.max(8, Math.round(speed)));
  };

  return (
    <div data-testid="hardware-advisor-container" className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <p className="font-mono text-[12px] text-ink-3">Apple Silicon Hardware & Memory Advisor</p>
        <h2 data-testid="advisor-heading" className="font-display text-3xl sm:text-4xl font-bold uppercase leading-none tracking-[0.01em] text-ink">
          Mac VRAM Headroom & Token Speed Calculator
        </h2>
        <p className="max-w-3xl text-[16px] leading-snug text-ink-2">
          Select your Mac chip (M1 through M4) and installed unified memory size to estimate VRAM headroom, token generation speed estimates, and model quantization recommendations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configuration Controls */}
        <div className="lg:col-span-5 space-y-5">
          {/* Generation Filter */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>1. Filter Apple Silicon Generation:</span>
            </label>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
              {(['All', 'M1', 'M2', 'M3', 'M4'] as const).map((gen) => (
                <button
                  key={gen}
                  type="button"
                  data-testid={`gen-filter-${gen.toLowerCase()}`}
                  onClick={() => setGenerationFilter(gen)}
                  className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer min-h-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    generationFilter === gen
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {gen}
                </button>
              ))}
            </div>

            {/* Chip Selection Grid */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 block">
                Select Mac Chip Model:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                {filteredChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    data-testid={`chip-select-${chip.id}`}
                    onClick={() => setSelectedChipId(chip.id)}
                    className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer min-h-[44px] flex items-center justify-between gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      selectedChipId === chip.id
                        ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200 font-bold shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div>
                      <div>{chip.name}</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        {chip.memoryBandwidthGBs} GB/s &bull; {chip.gpuCores} GPU Cores
                      </div>
                    </div>
                    {selectedChipId === chip.id && (
                      <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* RAM Selector Slider / Buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  2. Installed Unified RAM:
                </label>
                <span className="text-xs font-bold text-sky-400 font-mono bg-sky-950/80 px-2.5 py-0.5 rounded border border-sky-800/60">
                  {selectedRamGB} GB RAM
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {RAM_OPTIONS.map((ram) => (
                  <button
                    key={ram}
                    type="button"
                    data-testid={`ram-select-${ram}gb`}
                    onClick={() => setSelectedRamGB(ram)}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      selectedRamGB === ram
                        ? 'bg-sky-600 border-sky-500 text-white shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {ram} GB
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic Hardware Analysis Dashboard */}
        <div className="lg:col-span-7 space-y-5">
          <div
            data-testid="hardware-analysis-card"
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6"
          >
            {/* Top Chip Summary Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-semibold text-indigo-400 bg-indigo-950/80 border border-indigo-800/60 px-2.5 py-0.5 rounded">
                    {selectedChip.generation} {selectedChip.tier}
                  </span>
                </div>
                <h3 data-testid="selected-chip-title" className="text-xl font-extrabold text-slate-100">
                  {selectedChip.name} &bull; {selectedRamGB} GB Unified RAM
                </h3>
              </div>

              <div className="text-right bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 shrink-0">
                <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Memory Bandwidth</span>
                <span className="text-sm font-mono font-extrabold text-indigo-300">
                  {selectedChip.memoryBandwidthGBs} GB/s
                </span>
              </div>
            </div>

            {/* Memory Allocation Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  <span>Metal GPU VRAM</span>
                </div>
                <div data-testid="metric-usable-vram" className="text-lg font-extrabold text-emerald-300 font-mono">
                  ~{usableVramGB} GB
                </div>
                <div className="text-[10px] text-slate-400">Max RAM allocated for models</div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Neural Engine</span>
                </div>
                <div data-testid="metric-neural-engine" className="text-lg font-extrabold text-amber-300 font-mono">
                  {selectedChip.neuralEngineTops} TOPS
                </div>
                <div className="text-[10px] text-slate-400">On-device AI compute power</div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  <span>OS System Reserve</span>
                </div>
                <div data-testid="metric-system-reserve" className="text-lg font-extrabold text-sky-300 font-mono">
                  ~{systemReservedGB} GB
                </div>
                <div className="text-[10px] text-slate-400">Reserved for macOS &amp; app UI</div>
              </div>
            </div>

            {/* Model Compatibility Matrix for Selected Hardware */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4">
                <h4 className="text-sm font-bold text-slate-200">
                  Model Compatibility &amp; Speed Estimates for Your Mac
                </h4>
                <span className="text-xs text-slate-400">
                  Quantization Target: <strong className="text-indigo-300 font-mono">Q4_K_M</strong>
                </span>
              </div>

              <div className="space-y-2">
                {MODELS_DATA.map((model) => {
                  // Model VRAM footprint in GB calculated dynamically from catalog data
                  const estModelGB = getModelVramGB(model);

                  const canRun = usableVramGB >= estModelGB;
                  const estimatedSpeed = estimateTokensPerSec(estModelGB);
                  const vramMargin = Math.round((usableVramGB - estModelGB) * 10) / 10;

                  return (
                    <div
                      key={model.id}
                      data-testid={`model-fit-card-${model.id}`}
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                        canRun
                          ? 'bg-slate-950 border-slate-800/90 hover:border-slate-700'
                          : 'bg-slate-950/40 border-slate-900 opacity-60'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100">{model.name}</span>
                          <span className="text-[10px] text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded font-mono">
                            ~{estModelGB} GB VRAM
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">{model.description}</div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {canRun ? (
                          <div className="text-left sm:text-right">
                            <span className="text-xs font-mono font-bold text-emerald-400 block">
                              ~{estimatedSpeed} tok/s Estimated Generation Speed
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              +{vramMargin} GB Estimated VRAM Headroom
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-amber-400 font-semibold bg-amber-950/60 border border-amber-800/80 px-2.5 py-1 rounded-lg text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Needs {Math.round(estModelGB * 1.3)}GB+ RAM</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
