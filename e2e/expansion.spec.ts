import { test, expect } from './fixtures';

// Hermetic by default: no test in this file depends on a locally running
// Ollama, and the fixture's engine-absent state makes that a guarantee rather
// than an assumption about the machine.
test.use({ engineMode: 'absent' });

test.describe('Local Model Workshop - Expansion Features E2E Suite', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="app-container"]')).toBeVisible();
  });

  /* ==========================================================================
     HARDWARE ADVISOR (M1-M4 CHIPS)
     ========================================================================== */
  test('E2E-01: Hardware Advisor calculates VRAM headroom for M1-M4 chips', async ({ page }) => {
    await page.click('[data-testid="tab-hardware-advisor"]');
    await expect(page.locator('[data-testid="advisor-heading"]')).toContainText('Mac VRAM Headroom & Token Speed Calculator');

    // Filter by M4 chip generation
    await page.click('[data-testid="gen-filter-m4"]');
    await page.click('[data-testid="chip-select-m4-pro"]');
    await page.click('[data-testid="ram-select-36gb"]');

    // Assert calculated metrics
    await expect(page.locator('[data-testid="selected-chip-title"]')).toContainText('Apple M4 Pro');
    await expect(page.locator('[data-testid="selected-chip-title"]')).toContainText('36 GB Unified RAM');
    await expect(page.locator('[data-testid="metric-usable-vram"]')).toContainText('27 GB');
  });

  /* ==========================================================================
     macOS SHORTCUTS & AUTOMATION STUDIO
     ========================================================================== */
  test('E2E-02: Shortcuts Studio renders 1-click Apple Shortcuts blueprints', async ({ page }) => {
    await page.click('[data-testid="tab-shortcuts-studio"]');
    await expect(page.locator('[data-testid="shortcuts-heading"]')).toContainText('1-Click Apple Shortcuts & Global Hotkeys');

    // Select Dictation Hotkey Recipe
    await page.click('[data-testid="shortcut-blueprint-btn-dictation-hotkey"]');
    await expect(page.locator('[data-testid="shortcut-details-card"]')).toContainText('Global Dictation Cleanup Hotkey');
    await expect(page.locator('[data-testid="copy-blueprint-cmd-dictation-hotkey"]')).toBeVisible();
  });

  /* ==========================================================================
     BENCHMARK STUDIO & RECIPE EXPORTER
     ========================================================================== */
  test('E2E-03: Benchmark Studio compares models side-by-side and exports recipe', async ({ page }) => {
    await page.click('[data-testid="tab-benchmark-studio"]');
    await expect(page.locator('[data-testid="benchmark-heading"]')).toContainText('Benchmark & Compare Local Models');

    // Select comparison prompt
    await page.click('[data-testid="benchmark-prompt-btn-0"]');
    await expect(page.locator('[data-testid="benchmark-output-a"]')).toBeVisible();
    await expect(page.locator('[data-testid="benchmark-output-b"]')).toBeVisible();

    // Click Export Recipe button
    await page.click('[data-testid="export-recipe-btn"]');
    await expect(page.locator('[data-testid="export-recipe-btn"]')).toContainText('Recipe Downloaded!');
  });
});
