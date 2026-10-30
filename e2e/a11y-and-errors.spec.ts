import { test, expect } from './fixtures';

// Hermetic by default: no test in this file depends on a locally running
// Ollama, and the fixture's engine-absent state makes that a guarantee rather
// than an assumption about the machine.
test.use({ engineMode: 'absent' });

test.describe('Error boundary & accessibility E2E Suite', () => {

  /* ==========================================================================
     HARDWARE ADVISOR M3 ULTRA & M4 MAX CHIPS
     ========================================================================== */
  test('E2E-A11Y-01: HardwareAdvisor calculates metrics for M3 Ultra & M4 Max chips', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="app-container"]')).toBeVisible();

    await page.click('[data-testid="tab-hardware-advisor"]');
    await expect(page.locator('[data-testid="advisor-heading"]')).toContainText('Mac VRAM Headroom & Token Speed Calculator');

    // Test M3 Ultra
    await page.click('[data-testid="gen-filter-m3"]');
    await page.click('[data-testid="chip-select-m3-ultra"]');

    const selectedTitleM3 = page.locator('[data-testid="selected-chip-title"]');
    await expect(selectedTitleM3).toContainText('Apple M3 Ultra');

    const topsMetricM3 = page.locator('[data-testid="metric-neural-engine"]');
    await expect(topsMetricM3).toContainText('36 TOPS');

    const cardM3 = page.locator('[data-testid="hardware-analysis-card"]');
    await expect(cardM3).toContainText('819 GB/s');

    // Test M4 Max
    await page.click('[data-testid="gen-filter-m4"]');
    await page.click('[data-testid="chip-select-m4-max"]');

    const selectedTitleM4 = page.locator('[data-testid="selected-chip-title"]');
    await expect(selectedTitleM4).toContainText('Apple M4 Max');

    const topsMetricM4 = page.locator('[data-testid="metric-neural-engine"]');
    await expect(topsMetricM4).toContainText('38 TOPS');

    const cardM4 = page.locator('[data-testid="hardware-analysis-card"]');
    await expect(cardM4).toContainText('546 GB/s');
  });

  /* ==========================================================================
     ERROR BOUNDARY FALLBACK & RESET
     ========================================================================== */
  test('E2E-A11Y-02: ErrorBoundary displays fallback UI and reset button on error trigger', async ({ page }) => {
    await page.goto('/?triggerError=true');

    const fallback = page.locator('[data-testid="error-boundary-fallback"]');
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText('Something went wrong');

    const resetBtn = page.locator('[data-testid="reset-app-btn"]');
    await expect(resetBtn).toBeVisible();
    await expect(resetBtn).toContainText('Reset Application');

    // Verify clicking reset button is interactive
    await resetBtn.click();
  });

  /* ==========================================================================
     TASK WIZARD & MODEL CATALOG ACCESSIBILITY (MODALS)
     ========================================================================== */
  test('E2E-A11Y-03: TaskWizard and ModelCatalog setup modals adhere to ARIA dialog specs and close on Escape', async ({ page }) => {
    await page.goto('/');

    // TaskWizard Modal Accessibility
    await expect(page.locator('[data-testid="task-wizard-container"]')).toBeVisible();
    await page.click('[data-testid="view-setup-guide-btn"]');

    const taskModal = page.locator('[data-testid="task-setup-modal"]');
    await expect(taskModal).toBeVisible();
    await expect(taskModal).toHaveAttribute('role', 'dialog');
    await expect(taskModal).toHaveAttribute('aria-modal', 'true');

    await page.keyboard.press('Escape');
    await expect(taskModal).not.toBeVisible();

    // ModelCatalog Modal Accessibility
    await page.click('[data-testid="tab-model-catalog"]');
    await expect(page.locator('[data-testid="model-catalog-container"]')).toBeVisible();

    const firstModelSetupBtn = page.locator('[data-testid^="setup-modal-btn-"]').first();
    await firstModelSetupBtn.click();

    const modelModal = page.locator('[data-testid="model-setup-modal"]');
    await expect(modelModal).toBeVisible();
    await expect(modelModal).toHaveAttribute('role', 'dialog');
    await expect(modelModal).toHaveAttribute('aria-modal', 'true');

    await page.keyboard.press('Escape');
    await expect(modelModal).not.toBeVisible();
  });

  /* ==========================================================================
     MAC APP CLIENT PAIRINGS DISCOVERY
     ========================================================================== */
  test('E2E-A11Y-04: TaskWizard and ModelCatalog headers display discovery badges for Mac app clients', async ({ page }) => {
    await page.goto('/');

    // TaskWizard Header Client Pairings Badges
    const wizardContainer = page.locator('[data-testid="task-wizard-container"]');
    await expect(wizardContainer).toBeVisible();
    await expect(wizardContainer).toContainText('Jan (jan.ai)');
    await expect(wizardContainer).toContainText('GPT4All (gpt4all.io)');
    await expect(wizardContainer).toContainText('Msty (msty.app)');
    await expect(wizardContainer).toContainText('Open WebUI (openwebui.com)');

    // ModelCatalog Header Client Pairings Badges & Cards
    await page.click('[data-testid="tab-model-catalog"]');
    const catalogContainer = page.locator('[data-testid="model-catalog-container"]');
    await expect(catalogContainer).toBeVisible();
    await expect(catalogContainer).toContainText('Jan (jan.ai)');
    await expect(catalogContainer).toContainText('GPT4All (gpt4all.io)');
    await expect(catalogContainer).toContainText('Msty (msty.app)');
    await expect(catalogContainer).toContainText('Open WebUI (openwebui.com)');
  });
});
