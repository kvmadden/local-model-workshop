import { test, expect } from './fixtures';

// This file asserts the engine-DOWN surface throughout: the Tier 3 playground
// tests below check the hardcoded demo samples, which are only what a
// playground renders when no engine is reachable. `engineMode` defaults to
// 'absent', so that is now a property of the test rather than of whoever's
// laptop is running it. Live behaviour is covered in `engine-modes.spec.ts`.
test.use({ engineMode: 'absent' });

test.describe('Explore, compare and chain small local models E2E Suite', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the workshop
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-container"]');
    await page.waitForSelector('[data-testid="task-wizard-container"]');
  });

  /* ==========================================================================
     TIER 1: CORE LAYOUT & NAVIGATION
     ========================================================================== */
  test.describe('Tier 1: Core Layout & Navigation', () => {

    test('T1-01: Main header renders title, tagline, and navigation bar', async ({ page }) => {
      // Assert Header
      const header = page.locator('[data-testid="workshop-header"]');
      await expect(header).toBeVisible();

      // Assert Branding
      const title = page.locator('[data-testid="workshop-title"]');
      await expect(title).toHaveText(/Local Model Workshop/i);

      const subtitle = page.locator('[data-testid="workshop-subtitle"]');
      await expect(subtitle).toHaveText(/Explore, compare and chain small local models/i);

      // Assert Navigation Tabs are present
      await expect(page.locator('[data-testid="tab-task-wizard"]')).toBeVisible();
      await expect(page.locator('[data-testid="tab-model-catalog"]')).toBeVisible();
      await expect(page.locator('[data-testid="tab-use-case-studio"]')).toBeVisible();
    });

    test('T1-02: Tab navigation switches active view between Wizard, Catalog, Studio, and Builder', async ({ page }) => {
      // Task Wizard default active view
      await expect(page.locator('[data-testid="task-wizard-container"]')).toBeVisible();

      // Switch to Model Catalog
      await page.click('[data-testid="tab-model-catalog"]');
      await expect(page.locator('[data-testid="model-catalog-container"]')).toBeVisible();
      await expect(page.locator('[data-testid="task-wizard-container"]')).not.toBeVisible();

      // Switch to Use Case Studio
      await page.click('[data-testid="tab-use-case-studio"]');
      await expect(page.locator('[data-testid="use-case-studio-container"]')).toBeVisible();
      await expect(page.locator('[data-testid="model-catalog-container"]')).not.toBeVisible();

      // Switch to Flow Builder
      await page.click('[data-testid="tab-flow-builder"]');
      await expect(page.locator('[data-testid="flow-canvas"]')).toBeVisible();

      // Return to Task Wizard
      await page.click('[data-testid="tab-task-wizard"]');
      await expect(page.locator('[data-testid="task-wizard-container"]')).toBeVisible();
    });

    test('T1-03: Task Wizard hero banner renders non-technical zero-code guidance', async ({ page }) => {
      const heading = page.locator('[data-testid="wizard-heading"]');
      await expect(heading).toBeVisible();
      await expect(heading).toContainText('Match Your Mac Goal to the Perfect Local Model & App');

      // Check task options list renders
      const firstOption = page.locator('[data-testid="task-option-transcribe-meetings"]');
      await expect(firstOption).toBeVisible();
    });
  });

  /* ==========================================================================
     TIER 2: TASK WIZARD & MODEL CATALOG MAPPING
     ========================================================================== */
  test.describe('Tier 2: Task Wizard & Model Catalog Mapping', () => {

    test('T2-01: Task Wizard maps "Transcribe Meetings" goal to MacWhisper and Whisper model', async ({ page }) => {
      await page.click('[data-testid="task-option-transcribe-meetings"]');

      const card = page.locator('[data-testid="task-recommendation-card"]');
      await expect(card).toBeVisible();

      const appLabel = page.locator('[data-testid="recommended-app"]');
      await expect(appLabel).toHaveText('MacWhisper');

      const modelLabel = page.locator('[data-testid="recommended-model"]');
      await expect(modelLabel).toContainText('Whisper');
    });

    test('T2-02: Task Wizard maps "Private Document Search" goal to AnythingLLM and Llama 3.2', async ({ page }) => {
      await page.click('[data-testid="task-option-document-search"]');

      const appLabel = page.locator('[data-testid="recommended-app"]');
      await expect(appLabel).toHaveText('AnythingLLM');

      const modelLabel = page.locator('[data-testid="recommended-model"]');
      await expect(modelLabel).toContainText('Llama 3.2');
    });

    test('T2-03: Task Wizard maps "Offline Dictation" goal to LM Studio and Phi-3.5', async ({ page }) => {
      await page.click('[data-testid="task-option-dictation-cleanup"]');

      const appLabel = page.locator('[data-testid="recommended-app"]');
      await expect(appLabel).toHaveText('LM Studio');

      const modelLabel = page.locator('[data-testid="recommended-model"]');
      await expect(modelLabel).toContainText('Phi-3.5');
    });

    test('T2-04: Task Wizard maps "Local Code Reasoning" goal to Ollama and DeepSeek-R1', async ({ page }) => {
      await page.click('[data-testid="task-option-code-reasoning"]');

      const appLabel = page.locator('[data-testid="recommended-app"]');
      await expect(appLabel).toHaveText('Ollama');

      const modelLabel = page.locator('[data-testid="recommended-model"]');
      await expect(modelLabel).toContainText('DeepSeek-R1');
    });

    test('T2-05: Model Catalog renders cards for Llama 3.2, Qwen 2.5, DeepSeek-R1, Whisper, and Phi-3.5', async ({ page }) => {
      await page.click('[data-testid="tab-model-catalog"]');

      await expect(page.locator('[data-testid="model-card-llama-3.2-3b"]')).toBeVisible();
      await expect(page.locator('[data-testid="model-card-qwen-2.5-7b"]')).toBeVisible();
      await expect(page.locator('[data-testid="model-card-deepseek-r1-8b"]')).toBeVisible();
      await expect(page.locator('[data-testid="model-card-whisper-large-v3"]')).toBeVisible();
      await expect(page.locator('[data-testid="model-card-phi-3.5-mini"]')).toBeVisible();
    });

    test('T2-06: Model cards display Mac RAM metrics and Apple Silicon scores accurately', async ({ page }) => {
      await page.click('[data-testid="tab-model-catalog"]');

      // Verify Llama 3.2 specs
      const llamaRam = page.locator('[data-testid="ram-usage-llama-3.2-3b"]');
      await expect(llamaRam).toContainText('8 GB System RAM');
      await expect(llamaRam).toContainText('2.2 GB VRAM Footprint');

      const llamaSilicon = page.locator('[data-testid="silicon-score-llama-3.2-3b"]');
      await expect(llamaSilicon).toHaveText('Ultra-Fast (~45–85 tok/s)');

      // Verify DeepSeek-R1 specs
      const deepseekRam = page.locator('[data-testid="ram-usage-deepseek-r1-8b"]');
      await expect(deepseekRam).toContainText('16 GB System RAM');
      await expect(deepseekRam).toContainText('4.9 GB VRAM Footprint');

      const deepseekSilicon = page.locator('[data-testid="silicon-score-deepseek-r1-8b"]');
      await expect(deepseekSilicon).toHaveText('Deep Reasoning (~18–40 tok/s)');
    });

    test('T2-07: Opens and closes 1-Click Zero-Code Setup Steps Modal in Model Catalog', async ({ page }) => {
      await page.click('[data-testid="tab-model-catalog"]');

      // Click setup button for Whisper
      await page.click('[data-testid="setup-modal-btn-whisper-large-v3"]');

      // Modal should appear
      const modal = page.locator('[data-testid="model-setup-modal"]');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('1-Click Setup Guide: Whisper (Large-v3)');
      await expect(modal).toContainText('No Terminal Commands Needed');

      // Close modal via close button
      await page.click('[data-testid="close-modal-btn"]');
      await expect(modal).not.toBeVisible();
    });

    test('T2-08: Task Wizard opens and closes the interactive Task Setup Guide Modal', async ({ page }) => {
      await page.click('[data-testid="task-option-transcribe-meetings"]');

      // Click "Open Full Setup Modal" button
      await page.click('[data-testid="view-setup-guide-btn"]');

      const modal = page.locator('[data-testid="task-setup-modal"]');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('Setup Guide: Transcribe Audio & Video Meetings');

      // Close modal
      await page.click('[data-testid="close-task-modal-btn"]');
      await expect(modal).not.toBeVisible();
    });

    test('T2-09: Model Catalog filters model cards by RAM requirements (8 GB vs 16 GB+)', async ({ page }) => {
      await page.click('[data-testid="tab-model-catalog"]');

      // Filter by 8 GB RAM
      await page.click('[data-testid="ram-filter-8gb"]');
      await expect(page.locator('[data-testid="model-card-llama-3.2-3b"]')).toBeVisible();
      await expect(page.locator('[data-testid="model-card-whisper-large-v3"]')).toBeVisible();
      await expect(page.locator('[data-testid="model-card-deepseek-r1-8b"]')).not.toBeVisible();

      // Filter by 16 GB RAM
      await page.click('[data-testid="ram-filter-16gb"]');
      await expect(page.locator('[data-testid="model-card-deepseek-r1-8b"]')).toBeVisible();
      await expect(page.locator('[data-testid="model-card-qwen-2.5-7b"]')).toBeVisible();
      await expect(page.locator('[data-testid="model-card-llama-3.2-3b"]')).not.toBeVisible();

      // Reset to All Models
      await page.click('[data-testid="ram-filter-all"]');
      await expect(page.locator('[data-testid="model-card-llama-3.2-3b"]')).toBeVisible();
      await expect(page.locator('[data-testid="model-card-deepseek-r1-8b"]')).toBeVisible();
    });
  });

  /* ==========================================================================
     TIER 3: USE CASE STUDIO 4 PLAYGROUNDS
     ========================================================================== */
  test.describe('Tier 3: Use Case Studio 4 Playgrounds', () => {

    // Every assertion in this block is against DEMO output. That is correct
    // only while no engine is reachable — `engineMode: 'absent'` at the top of
    // the file guarantees it. Before that fixture existed, T3-02 and T3-04
    // failed on any machine with Ollama up and a llama/qwen tag installed,
    // because the playgrounds went live and streamed real tokens instead.

    test.beforeEach(async ({ page }) => {
      await page.waitForSelector('[data-testid="tab-use-case-studio"]');
      await page.click('[data-testid="tab-use-case-studio"]');
      await page.waitForSelector('[data-testid="use-case-studio-container"]');
    });

    test('T3-01: Voice Transcription playground processes audio transcript cleanly', async ({ page }) => {
      await page.click('[data-testid="usecase-tab-transcription"]');
      await expect(page.locator('[data-testid="playground-title"]')).toHaveText('Voice Transcription Playground');

      // Select first sample
      await page.click('[data-testid="sample-input-btn-0"]');
      await page.click('[data-testid="run-playground-btn"]');

      // Verify output container renders transcript cleanly
      const output = page.locator('[data-testid="playground-output-container"]');
      await expect(output).toContainText('Local Transcription Result');
      await expect(output).toContainText('Q3 product roadmap');
      await expect(output).toContainText('Apple Silicon GPU');
    });

    test('T3-02: Confidential Document Summarizing playground generates executive summary', async ({ page }) => {
      await page.click('[data-testid="usecase-tab-summarizing"]');
      await expect(page.locator('[data-testid="playground-title"]')).toHaveText('Confidential Document Summarizing Playground');

      await page.click('[data-testid="sample-input-btn-0"]');
      await page.click('[data-testid="run-playground-btn"]');

      const output = page.locator('[data-testid="playground-output-container"]');
      await expect(output).toContainText('Confidential Summary');
      await expect(output).toContainText('On-Device Processing');
    });

    test('T3-03: Dictation Cleanup playground cleans up spoken dictation and removes filler words', async ({ page }) => {
      await page.click('[data-testid="usecase-tab-dictation"]');
      await expect(page.locator('[data-testid="playground-title"]')).toHaveText('Dictation Cleanup Playground');

      await page.click('[data-testid="sample-input-btn-0"]');
      await page.click('[data-testid="run-playground-btn"]');

      const output = page.locator('[data-testid="playground-output-container"]');
      await expect(output).toContainText('Polished Dictation Output');
      await expect(output).toContainText('Cleaned up formatting');
    });

    test('T3-04: File Chatting playground answers query from document context cleanly', async ({ page }) => {
      await page.click('[data-testid="usecase-tab-file-chat"]');
      await expect(page.locator('[data-testid="playground-title"]')).toHaveText('File Chatting Playground');

      await page.click('[data-testid="sample-input-btn-0"]');
      await page.click('[data-testid="run-playground-btn"]');

      const output = page.locator('[data-testid="playground-output-container"]');
      await expect(output).toContainText('Direct Answer from Local Context');
      await expect(output).toContainText('exposing sensitive content to public servers');
    });
  });

  /* ==========================================================================
     TIER 4: ZERO-CODE UI VALIDATION
     ========================================================================== */
  test.describe('Tier 4: Zero-Code UI Validation', () => {

    test('T4-01: Asserts NO raw code blocks (<code> or <pre>) exist in Task Wizard, Model Catalog, or Studio views', async ({ page }) => {
      // Check Task Wizard
      await page.click('[data-testid="tab-task-wizard"]');
      expect(await page.locator('code').count()).toBe(0);
      expect(await page.locator('pre').count()).toBe(0);

      // Check Model Catalog
      await page.click('[data-testid="tab-model-catalog"]');
      expect(await page.locator('code').count()).toBe(0);
      expect(await page.locator('pre').count()).toBe(0);

      // Check Use Case Studio
      await page.click('[data-testid="tab-use-case-studio"]');
      expect(await page.locator('code').count()).toBe(0);
      expect(await page.locator('pre').count()).toBe(0);
    });

    test('T4-02: Asserts NO raw JSON configurations or objects displayed in visible UI text', async ({ page }) => {
      // Sweep tabs for raw JSON objects like {"model": or {"key":
      const rawJsonRegex = /\{"\w+":/i;

      // Task Wizard
      await page.click('[data-testid="tab-task-wizard"]');
      let wizardText = await page.locator('[data-testid="app-container"]').innerText();
      expect(wizardText).not.toMatch(rawJsonRegex);

      // Model Catalog
      await page.click('[data-testid="tab-model-catalog"]');
      let catalogText = await page.locator('[data-testid="app-container"]').innerText();
      expect(catalogText).not.toMatch(rawJsonRegex);

      // Use Case Studio
      await page.click('[data-testid="tab-use-case-studio"]');
      let studioText = await page.locator('[data-testid="app-container"]').innerText();
      expect(studioText).not.toMatch(rawJsonRegex);
    });

    test('T4-03: Asserts NO {{input}} or {{template}} placeholders exist anywhere in UI text', async ({ page }) => {
      const templatePlaceholderRegex = /\{\{\w+\}\}/i;

      // Task Wizard
      await page.click('[data-testid="tab-task-wizard"]');
      let wizardText = await page.locator('[data-testid="app-container"]').innerText();
      expect(wizardText).not.toMatch(templatePlaceholderRegex);

      // Model Catalog
      await page.click('[data-testid="tab-model-catalog"]');
      let catalogText = await page.locator('[data-testid="app-container"]').innerText();
      expect(catalogText).not.toMatch(templatePlaceholderRegex);

      // Use Case Studio
      await page.click('[data-testid="tab-use-case-studio"]');
      let studioText = await page.locator('[data-testid="app-container"]').innerText();
      expect(studioText).not.toMatch(templatePlaceholderRegex);
    });
  });

});
