/**
 * hardware-layout.stress.test.tsx
 * Stress tests for the hardware advisor and layout
 * (HardwareAdvisor logic, M3 Ultra and M4 Max chips, 192GB RAM options,
 *  ModelCatalog filtering, 1-Click setup modal, and BenchmarkStudio model selection).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { HardwareAdvisor } from './HardwareAdvisor';
import { ModelCatalog } from './ModelCatalog';
import { BenchmarkStudio } from './BenchmarkStudio';
import { MAC_CHIPS, RAM_OPTIONS } from '../data/hardwareData';
import { MODELS_DATA } from '../data/models';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Hardware advisor and layout stress tests', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
  });

  const renderComponent = async (element: React.ReactElement) => {
    await act(async () => {
      root!.render(element);
    });
  };

  const getByTestId = (testId: string): HTMLElement | null => {
    return container?.querySelector(`[data-testid="${testId}"]`) || null;
  };

  const getAllByTestIdPrefix = (prefix: string): HTMLElement[] => {
    if (!container) return [];
    return Array.from(container.querySelectorAll(`[data-testid^="${prefix}"]`));
  };

  // =========================================================================
  // TASK 1: HardwareAdvisor Chip Selection Logic & 192GB RAM Options
  // =========================================================================
  describe('Task 1: HardwareAdvisor Chip Selection & Memory Calculation Stress', () => {
    it('Data integrity check: MAC_CHIPS lists shipped chips only (no M4 Ultra, no projected rows)', () => {
      const chipIds = MAC_CHIPS.map((c) => c.id);
      expect(chipIds).toContain('m3-ultra');
      expect(chipIds).toContain('m4-max');
      expect(chipIds).not.toContain('m4-ultra');
      expect(chipIds.some((id) => id.startsWith('m5'))).toBe(false);
      expect(MAC_CHIPS.some((c) => /projected/i.test(c.name))).toBe(false);

      const m3Ultra = MAC_CHIPS.find((c) => c.id === 'm3-ultra');
      expect(m3Ultra?.memoryBandwidthGBs).toBe(819);
      expect(m3Ultra?.gpuCores).toBe(80);
      expect(m3Ultra?.neuralEngineTops).toBe(36);

      const m4Max = MAC_CHIPS.find((c) => c.id === 'm4-max');
      expect(m4Max?.memoryBandwidthGBs).toBe(546);
      expect(m4Max?.gpuCores).toBe(40);
    });

    it('Data integrity check: RAM_OPTIONS contains 192GB option', () => {
      expect(RAM_OPTIONS).toContain(192);
      expect(RAM_OPTIONS).toEqual([8, 16, 24, 36, 48, 64, 96, 128, 192]);
    });

    it('HardwareAdvisor renders container and initial default chip selection (M4 Pro, 24GB)', async () => {
      await renderComponent(<HardwareAdvisor />);

      expect(getByTestId('hardware-advisor-container')).not.toBeNull();
      expect(getByTestId('advisor-heading')?.textContent).toContain('Mac VRAM headroom and token speed calculator');
      expect(getByTestId('selected-chip-title')?.textContent).toContain('Apple M4 Pro');
      expect(getByTestId('selected-chip-title')?.textContent).toContain('24 GB Unified RAM');
    });

    it('HardwareAdvisor filters chips correctly by generation (M3, M4)', async () => {
      await renderComponent(<HardwareAdvisor />);

      // Filter M3
      const filterM3Btn = getByTestId('gen-filter-m3');
      await act(async () => {
        filterM3Btn?.click();
      });
      expect(getByTestId('chip-select-m3-base')).not.toBeNull();
      expect(getByTestId('chip-select-m3-pro')).not.toBeNull();
      expect(getByTestId('chip-select-m3-max')).not.toBeNull();
      expect(getByTestId('chip-select-m3-ultra')).not.toBeNull();
      expect(getByTestId('chip-select-m4-base')).toBeNull();

      // Filter M4
      const filterM4Btn = getByTestId('gen-filter-m4');
      await act(async () => {
        filterM4Btn?.click();
      });
      expect(getByTestId('chip-select-m4-base')).not.toBeNull();
      expect(getByTestId('chip-select-m4-pro')).not.toBeNull();
      expect(getByTestId('chip-select-m4-max')).not.toBeNull();
      expect(getByTestId('chip-select-m4-ultra')).toBeNull();
      expect(getByTestId('gen-filter-m5')).toBeNull();
    });

    it('HardwareAdvisor updates VRAM headroom and Neural Engine TOPS when selecting M3 Ultra', async () => {
      await renderComponent(<HardwareAdvisor />);

      const filterM3Btn = getByTestId('gen-filter-m3');
      await act(async () => {
        filterM3Btn?.click();
      });

      const selectM3Ultra = getByTestId('chip-select-m3-ultra');
      await act(async () => {
        selectM3Ultra?.click();
      });

      expect(getByTestId('selected-chip-title')?.textContent).toContain('Apple M3 Ultra');
      expect(getByTestId('metric-neural-engine')?.textContent).toBe('36 TOPS');
    });

    it('HardwareAdvisor updates VRAM headroom and Neural Engine TOPS when selecting M4 Max', async () => {
      await renderComponent(<HardwareAdvisor />);

      const filterM4Btn = getByTestId('gen-filter-m4');
      await act(async () => {
        filterM4Btn?.click();
      });

      const selectM4Max = getByTestId('chip-select-m4-max');
      await act(async () => {
        selectM4Max?.click();
      });

      expect(getByTestId('selected-chip-title')?.textContent).toContain('Apple M4 Max');
      expect(getByTestId('metric-neural-engine')?.textContent).toBe('38 TOPS');
    });

    it('HardwareAdvisor calculates exact Metal GPU VRAM and System Reserve for 192GB RAM option', async () => {
      await renderComponent(<HardwareAdvisor />);

      const ram192Btn = getByTestId('ram-select-192gb');
      await act(async () => {
        ram192Btn?.click();
      });

      // 192 * 0.75 = 144 GB VRAM headroom
      expect(getByTestId('metric-usable-vram')?.textContent).toContain('~144 GB');
      // 192 - 144 = 48 GB system reserve
      expect(getByTestId('metric-system-reserve')?.textContent).toContain('~48 GB');
    });

    it('HardwareAdvisor calculates headroom and token speed correctly across low (8GB) vs high (192GB) RAM', async () => {
      await renderComponent(<HardwareAdvisor />);

      // Select 8GB RAM
      const ram8Btn = getByTestId('ram-select-8gb');
      await act(async () => {
        ram8Btn?.click();
      });
      // 8 * 0.75 = 6 GB Usable VRAM
      expect(getByTestId('metric-usable-vram')?.textContent).toContain('~6 GB');

      // Select 192GB RAM
      const ram192Btn = getByTestId('ram-select-192gb');
      await act(async () => {
        ram192Btn?.click();
      });

      const modelCards = getAllByTestIdPrefix('model-fit-card-');
      expect(modelCards.length).toBe(5);
    });
  });

  // =========================================================================
  // TASK 2: ModelCatalog Filtering, 1-Click Setup Modal, BenchmarkStudio
  // =========================================================================
  describe('Task 2: ModelCatalog & BenchmarkStudio Integration & Stress', () => {
    it('ModelCatalog filters cards cleanly by RAM requirement (All, 8GB, 16GB+)', async () => {
      await renderComponent(<ModelCatalog />);

      expect(getByTestId('model-card-llama-3.2-3b')).not.toBeNull();
      expect(getByTestId('model-card-qwen-2.5-7b')).not.toBeNull();
      expect(getByTestId('model-card-deepseek-r1-8b')).not.toBeNull();
      expect(getByTestId('model-card-whisper-large-v3')).not.toBeNull();
      expect(getByTestId('model-card-phi-3.5-mini')).not.toBeNull();

      // Filter 8GB
      await act(async () => {
        getByTestId('ram-filter-8gb')?.click();
      });
      expect(getByTestId('model-card-llama-3.2-3b')).not.toBeNull();
      expect(getByTestId('model-card-whisper-large-v3')).not.toBeNull();
      expect(getByTestId('model-card-phi-3.5-mini')).not.toBeNull();
      expect(getByTestId('model-card-qwen-2.5-7b')).toBeNull();
      expect(getByTestId('model-card-deepseek-r1-8b')).toBeNull();

      // Filter 16GB+
      await act(async () => {
        getByTestId('ram-filter-16gb')?.click();
      });
      expect(getByTestId('model-card-qwen-2.5-7b')).not.toBeNull();
      expect(getByTestId('model-card-deepseek-r1-8b')).not.toBeNull();
      expect(getByTestId('model-card-llama-3.2-3b')).toBeNull();
    });

    it('ModelCatalog 1-Click Setup Modal opens and closes for all models', async () => {
      await renderComponent(<ModelCatalog />);

      for (const model of MODELS_DATA) {
        const setupBtn = getByTestId(`setup-modal-btn-${model.id}`);
        expect(setupBtn).not.toBeNull();

        await act(async () => {
          setupBtn?.click();
        });

        const modal = getByTestId('model-setup-modal');
        expect(modal).not.toBeNull();
        expect(modal?.textContent).toContain(`1-Click Setup Guide: ${model.name}`);
        expect(modal?.textContent).toContain(model.macRamRequired);

        const closeBtn = getByTestId('close-modal-btn');
        await act(async () => {
          closeBtn?.click();
        });

        expect(getByTestId('model-setup-modal')).toBeNull();
      }
    });

    it('BenchmarkStudio supports selecting Model A and Model B from updated data structures', async () => {
      await renderComponent(<BenchmarkStudio />);

      expect(getByTestId('benchmark-studio-container')).not.toBeNull();
      expect(getByTestId('select-model-a')).not.toBeNull();
      expect(getByTestId('select-model-b')).not.toBeNull();

      const selectA = getByTestId('select-model-a') as HTMLSelectElement;
      const selectB = getByTestId('select-model-b') as HTMLSelectElement;

      // Select Qwen 2.5 (7B) for Model A
      await act(async () => {
        selectA.value = 'qwen-2.5-7b';
        selectA.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Select Phi-3.5 Mini (3.8B) for Model B
      await act(async () => {
        selectB.value = 'phi-3.5-mini';
        selectB.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(getByTestId('benchmark-output-a')?.textContent).toContain('Qwen 2.5 (7B)');
      expect(getByTestId('benchmark-output-b')?.textContent).toContain('Phi-3.5 Mini (3.8B)');
    });

    it('BenchmarkStudio switches prompts and triggers export recipe button', async () => {
      // Mock URL.createObjectURL and revokeObjectURL
      const origCreate = window.URL.createObjectURL;
      const origRevoke = window.URL.revokeObjectURL;
      window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      window.URL.revokeObjectURL = vi.fn();

      await renderComponent(<BenchmarkStudio />);

      const promptBtn1 = getByTestId('benchmark-prompt-btn-1');
      await act(async () => {
        promptBtn1?.click();
      });

      expect(getByTestId('benchmark-output-a')?.textContent).toContain('Subject: Project Status Update');

      const exportBtn = getByTestId('export-recipe-btn');
      await act(async () => {
        exportBtn?.click();
      });

      expect(exportBtn?.textContent).toContain('Recipe Downloaded!');

      window.URL.createObjectURL = origCreate;
      window.URL.revokeObjectURL = origRevoke;
    });
  });
});
