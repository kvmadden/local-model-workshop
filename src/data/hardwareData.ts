export interface MacChipInfo {
  id: string;
  name: string;
  generation: 'M1' | 'M2' | 'M3' | 'M4';
  tier: 'Base' | 'Pro' | 'Max' | 'Ultra';
  memoryBandwidthGBs: number;
  gpuCores: number;
  neuralEngineTops: number;
}

// Published memory bandwidth and GPU core counts for the top configuration of each chip.
// Apple did not ship an M4 Ultra. M5-family rows are left out until they can be checked.
export const MAC_CHIPS: MacChipInfo[] = [
  // M1 Series
  { id: 'm1-base', name: 'Apple M1', generation: 'M1', tier: 'Base', memoryBandwidthGBs: 68, gpuCores: 8, neuralEngineTops: 11 },
  { id: 'm1-pro', name: 'Apple M1 Pro', generation: 'M1', tier: 'Pro', memoryBandwidthGBs: 200, gpuCores: 16, neuralEngineTops: 11 },
  { id: 'm1-max', name: 'Apple M1 Max', generation: 'M1', tier: 'Max', memoryBandwidthGBs: 400, gpuCores: 32, neuralEngineTops: 11 },
  { id: 'm1-ultra', name: 'Apple M1 Ultra', generation: 'M1', tier: 'Ultra', memoryBandwidthGBs: 800, gpuCores: 64, neuralEngineTops: 22 },

  // M2 Series
  { id: 'm2-base', name: 'Apple M2', generation: 'M2', tier: 'Base', memoryBandwidthGBs: 100, gpuCores: 10, neuralEngineTops: 15.8 },
  { id: 'm2-pro', name: 'Apple M2 Pro', generation: 'M2', tier: 'Pro', memoryBandwidthGBs: 200, gpuCores: 19, neuralEngineTops: 15.8 },
  { id: 'm2-max', name: 'Apple M2 Max', generation: 'M2', tier: 'Max', memoryBandwidthGBs: 400, gpuCores: 38, neuralEngineTops: 15.8 },
  { id: 'm2-ultra', name: 'Apple M2 Ultra', generation: 'M2', tier: 'Ultra', memoryBandwidthGBs: 800, gpuCores: 76, neuralEngineTops: 31.6 },

  // M3 Series
  { id: 'm3-base', name: 'Apple M3', generation: 'M3', tier: 'Base', memoryBandwidthGBs: 100, gpuCores: 10, neuralEngineTops: 18 },
  { id: 'm3-pro', name: 'Apple M3 Pro', generation: 'M3', tier: 'Pro', memoryBandwidthGBs: 150, gpuCores: 18, neuralEngineTops: 18 },
  { id: 'm3-max', name: 'Apple M3 Max', generation: 'M3', tier: 'Max', memoryBandwidthGBs: 400, gpuCores: 40, neuralEngineTops: 18 },
  { id: 'm3-ultra', name: 'Apple M3 Ultra', generation: 'M3', tier: 'Ultra', memoryBandwidthGBs: 819, gpuCores: 80, neuralEngineTops: 36 },

  // M4 Series
  { id: 'm4-base', name: 'Apple M4', generation: 'M4', tier: 'Base', memoryBandwidthGBs: 120, gpuCores: 10, neuralEngineTops: 38 },
  { id: 'm4-pro', name: 'Apple M4 Pro', generation: 'M4', tier: 'Pro', memoryBandwidthGBs: 273, gpuCores: 20, neuralEngineTops: 38 },
  { id: 'm4-max', name: 'Apple M4 Max', generation: 'M4', tier: 'Max', memoryBandwidthGBs: 546, gpuCores: 40, neuralEngineTops: 38 },

];

export const RAM_OPTIONS = [8, 16, 24, 36, 48, 64, 96, 128, 192];
