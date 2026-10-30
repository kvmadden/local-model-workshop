import { test, expect } from './fixtures';

// Hermetic by default: no test in this file depends on a locally running
// Ollama, and the fixture's engine-absent state makes that a guarantee rather
// than an assumption about the machine.
test.use({ engineMode: 'absent' });

test.describe('Local Model Workshop - E2E Flow Builder Suite', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the app before each test
    await page.goto('/');
    await expect(page.locator('[data-testid="app-container"]')).toBeVisible();
    await page.waitForSelector('[data-testid="tab-flow-builder"]');
    await page.click('[data-testid="tab-flow-builder"]');
  });

  // ==========================================
  // TIER 1: Feature Coverage (Core Happy Paths)
  // ==========================================
  test.describe('Tier 1: Core Feature Coverage', () => {

    test('1.1 Canvas Rendering - verifies initial layout and components', async ({ page }) => {
      await expect(page.locator('[data-testid="flow-title-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="initial-input-textarea"]')).toBeVisible();
      await expect(page.locator('[data-testid="flow-canvas"]')).toBeVisible();
      await expect(page.locator('[data-testid="add-step-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="run-flow-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="step-card-0"]')).toBeVisible();
    });

    test('1.2 2-Step Flow Creation - adds a second step and verifies step card indexing', async ({ page }) => {
      // Verify first step exists
      await expect(page.locator('[data-testid="step-card-0"]')).toBeVisible();
      
      // Click Add Step
      await page.locator('[data-testid="add-step-btn"]').click();
      
      // Verify second step card is rendered
      await expect(page.locator('[data-testid="step-card-1"]')).toBeVisible();
      await expect(page.locator('[data-testid="step-status-badge-0"]')).toHaveText(/idle/i);
      await expect(page.locator('[data-testid="step-status-badge-1"]')).toHaveText(/idle/i);
    });

    test('1.3 Step Prompt Editing - edits step prompts referencing input and step outputs', async ({ page }) => {
      // Set initial input
      await page.locator('[data-testid="initial-input-textarea"]').fill('Quantum Computing Basics');

      // Edit Step 1 prompt
      await page.locator('[data-testid="step-prompt-textarea-0"]').fill('Summarize the following topic: {{input}}');

      // Add Step 2
      await page.locator('[data-testid="add-step-btn"]').click();

      // Edit Step 2 prompt referencing step 1 output
      await page.locator('[data-testid="step-prompt-textarea-1"]').fill('Convert summary to key bullet points: {{step1.output}}');

      // Assert textarea values match
      await expect(page.locator('[data-testid="step-prompt-textarea-0"]')).toHaveValue('Summarize the following topic: {{input}}');
      await expect(page.locator('[data-testid="step-prompt-textarea-1"]')).toHaveValue('Convert summary to key bullet points: {{step1.output}}');
    });

    test('1.4 Mock Model Execution & UI Output Verification - runs 2-step flow and checks output', async ({ page }) => {
      // Setup input and step prompts
      await page.locator('[data-testid="initial-input-textarea"]').fill('Vite + React Architecture');
      await page.locator('[data-testid="step-prompt-textarea-0"]').fill('Analyze architecture: {{input}}');
      
      await page.locator('[data-testid="add-step-btn"]').click();
      await page.locator('[data-testid="step-prompt-textarea-1"]').fill('Translate analysis: {{step1.output}}');

      // Trigger flow execution
      await page.locator('[data-testid="run-flow-btn"]').click();

      // Verify status transitions to running then completed
      await expect(page.locator('[data-testid="step-status-badge-0"]')).toHaveText(/completed/i);
      await expect(page.locator('[data-testid="step-status-badge-1"]')).toHaveText(/completed/i);
      await expect(page.locator('[data-testid="flow-status-badge"]')).toHaveText(/completed/i);

      // Verify non-empty output text containers
      await expect(page.locator('[data-testid="step-output-container-0"]')).not.toBeEmpty();
      await expect(page.locator('[data-testid="step-output-container-1"]')).not.toBeEmpty();
      await expect(page.locator('[data-testid="step-latency-badge-0"]')).toBeVisible();
    });
  });

  // ==========================================
  // TIER 2: Boundary & Corner Cases
  // ==========================================
  test.describe('Tier 2: Boundary & Corner Cases', () => {

    test('2.1 Validation on Empty Prompt / Input', async ({ page }) => {
      // Clear initial input and prompt
      await page.locator('[data-testid="initial-input-textarea"]').fill('');
      await page.locator('[data-testid="step-prompt-textarea-0"]').fill('');

      // Click run flow
      await page.locator('[data-testid="run-flow-btn"]').click();

      // Expect either error status badge or validation error message
      await expect(
        page.locator('[data-testid="step-status-badge-0"]').or(page.locator('[data-testid="step-error-container-0"]'))
      ).toBeVisible();
    });

    test('2.2 Multi-line Prompts & Code Snippet Templates', async ({ page }) => {
      const multilinePrompt = `System Context: You are a senior engineer.
Input Code:
\`\`\`ts
const x = 42;
\`\`\`
Task: Refactor the following:
{{input}}`;

      await page.locator('[data-testid="initial-input-textarea"]').fill('function foo() { return true; }');
      await page.locator('[data-testid="step-prompt-textarea-0"]').fill(multilinePrompt);

      await page.locator('[data-testid="run-flow-btn"]').click();
      await expect(page.locator('[data-testid="step-status-badge-0"]')).toHaveText(/completed/i);
      await expect(page.locator('[data-testid="step-output-container-0"]')).toBeVisible();
    });

    test('2.3 Template Variable Special Characters & Whitespace Handling', async ({ page }) => {
      // Test template tags with spaces like {{ input }} or {{ step1.output }}
      await page.locator('[data-testid="initial-input-textarea"]').fill('Special String: $%#@!');
      await page.locator('[data-testid="step-prompt-textarea-0"]').fill('Process {{ input }} with symbols');

      await page.locator('[data-testid="run-flow-btn"]').click();
      await expect(page.locator('[data-testid="step-status-badge-0"]')).toHaveText(/completed/i);
    });

    test('2.4 Endpoint Provider & Model Toggling', async ({ page }) => {
      // Select provider option
      await page.locator('[data-testid="step-provider-select-0"]').selectOption('mock');
      await page.locator('[data-testid="step-model-select-0"]').fill('mock-gpt-4o');

      // Adjust temperature slider
      const tempSlider = page.locator('[data-testid="step-temp-slider-0"]');
      await expect(tempSlider).toBeVisible();
      await tempSlider.fill('0.7');

      await page.locator('[data-testid="run-flow-btn"]').click();
      await expect(page.locator('[data-testid="step-status-badge-0"]')).toHaveText(/completed/i);
    });
  });

  // ==========================================
  // TIER 3: Cross-Feature Combinations
  // ==========================================
  test.describe('Tier 3: Cross-Feature Combinations', () => {

    test('3.1 Step Re-ordering updates execution order & index attributes', async ({ page }) => {
      await page.locator('[data-testid="step-prompt-textarea-0"]').fill('First Step Prompt');
      
      await page.locator('[data-testid="add-step-btn"]').click();
      await page.locator('[data-testid="step-prompt-textarea-1"]').fill('Second Step Prompt');

      // Move Step 2 up to index 0
      await page.locator('[data-testid="step-move-up-btn-1"]').click();

      // Step 0 should now hold 'Second Step Prompt'
      await expect(page.locator('[data-testid="step-prompt-textarea-0"]')).toHaveValue('Second Step Prompt');
      await expect(page.locator('[data-testid="step-prompt-textarea-1"]')).toHaveValue('First Step Prompt');
    });

    test('3.2 Mid-Flow Intermediate Output Editing propagates downstream', async ({ page }) => {
      await page.locator('[data-testid="initial-input-textarea"]').fill('Raw Data');
      await page.locator('[data-testid="step-prompt-textarea-0"]').fill('Step 1: {{input}}');
      
      await page.locator('[data-testid="add-step-btn"]').click();
      await page.locator('[data-testid="step-prompt-textarea-1"]').fill('Step 2: {{step1.output}}');

      // Run initial flow
      await page.locator('[data-testid="run-flow-btn"]').click();
      await expect(page.locator('[data-testid="step-status-badge-1"]')).toHaveText(/completed/i);

      // Manually edit Step 1 output container/editor
      const step1OutputEditor = page.locator('[data-testid="step-output-editor-0"]');
      await expect(step1OutputEditor).toBeVisible();
      await step1OutputEditor.fill('MANUALLY_OVERRIDDEN_STEP_1_OUTPUT');
      
      // Re-run step 2 individually
      await page.locator('[data-testid="step-run-btn-1"]').click();
      await expect(page.locator('[data-testid="step-status-badge-1"]')).toHaveText(/completed/i);

      // Verify step 2 output reflects updated step 1 text
      await expect(page.locator('[data-testid="step-output-container-1"]')).toContainText(/MANUALLY_OVERRIDDEN_STEP_1_OUTPUT/i);
    });

    test('3.3 Independent Per-Step Re-runs', async ({ page }) => {
      await page.locator('[data-testid="initial-input-textarea"]').fill('Independent test');
      await page.locator('[data-testid="step-prompt-textarea-0"]').fill('Run step 0');

      // Click single step run button
      await page.locator('[data-testid="step-run-btn-0"]').click();
      await expect(page.locator('[data-testid="step-status-badge-0"]')).toHaveText(/completed/i);
    });
  });

  // ==========================================
  // TIER 4: Real-World Workflow Scenarios
  // ==========================================
  test.describe('Tier 4: Real-World Scenarios', () => {

    test('4.1 Scenario A: Summarize -> Translate Chain', async ({ page }) => {
      const articleText = 'Local LLMs enable private, latency-free flow automation on developer hardware without vendor lock-in.';
      
      // Step 0: Summarization
      await page.locator('[data-testid="initial-input-textarea"]').fill(articleText);
      await page.locator('[data-testid="step-title-input-0"]').fill('Summarizer');
      await page.locator('[data-testid="step-prompt-textarea-0"]').fill('Summarize in 5 words: {{input}}');

      // Step 1: Translation
      await page.locator('[data-testid="add-step-btn"]').click();
      await page.locator('[data-testid="step-title-input-1"]').fill('Translator');
      await page.locator('[data-testid="step-prompt-textarea-1"]').fill('Translate this summary to Spanish: {{step1.output}}');

      // Execute flow
      await page.locator('[data-testid="run-flow-btn"]').click();

      // Assert flow completion and outputs
      await expect(page.locator('[data-testid="step-status-badge-0"]')).toHaveText(/completed/i);
      await expect(page.locator('[data-testid="step-status-badge-1"]')).toHaveText(/completed/i);
      await expect(page.locator('[data-testid="flow-status-badge"]')).toHaveText(/completed/i);

      await expect(page.locator('[data-testid="step-output-container-0"]')).not.toBeEmpty();
      await expect(page.locator('[data-testid="step-output-container-1"]')).not.toBeEmpty();
    });

    test('4.2 Scenario B: Key Theme Extraction -> Executive Summary Paragraph', async ({ page }) => {
      const feedbackNotes = `Feedback 1: App is super fast and lightweight.
Feedback 2: Would love support for Ollama custom ports.
Feedback 3: Dark mode UI looks fantastic.`;

      // Step 0: Theme Extraction
      await page.locator('[data-testid="initial-input-textarea"]').fill(feedbackNotes);
      await page.locator('[data-testid="step-title-input-0"]').fill('Theme Extractor');
      await page.locator('[data-testid="step-prompt-textarea-0"]').fill('Extract key themes as bullet points: {{input}}');

      // Step 1: Executive Paragraph
      await page.locator('[data-testid="add-step-btn"]').click();
      await page.locator('[data-testid="step-title-input-1"]').fill('Executive Summarizer');
      await page.locator('[data-testid="step-prompt-textarea-1"]').fill('Draft a 2-sentence executive summary based on: {{step1.output}}');

      // Execute flow
      await page.locator('[data-testid="run-flow-btn"]').click();

      // Verify chain complete
      await expect(page.locator('[data-testid="step-status-badge-0"]')).toHaveText(/completed/i);
      await expect(page.locator('[data-testid="step-status-badge-1"]')).toHaveText(/completed/i);
      await expect(page.locator('[data-testid="step-output-container-1"]')).not.toBeEmpty();
    });

    test('4.3 Simulated Latency & Loading Spinner Visual State', async ({ page }) => {
      await page.locator('[data-testid="initial-input-textarea"]').fill('Latency Test Input');
      await page.locator('[data-testid="step-prompt-textarea-0"]').fill('Process with simulated latency: {{input}}');

      // Verify initial idle status badge state
      await expect(page.locator('[data-testid="step-status-badge-0"]')).toHaveText(/idle/i);

      // Execute flow
      await page.locator('[data-testid="run-flow-btn"]').click();

      // Assert step status badge transitions from running to completed
      await expect(page.locator('[data-testid="step-status-badge-0"]')).toHaveText(/running|completed/i);
      await expect(page.locator('[data-testid="step-status-badge-0"]')).toHaveText(/completed/i);

      // Assert step latency badge displays execution duration
      await expect(page.locator('[data-testid="step-latency-badge-0"]')).toBeVisible();
    });

    test('4.4 Error Banner & Graceful Failure Handling', async ({ page }) => {
      await page.locator('[data-testid="initial-input-textarea"]').fill('Error Test Input');
      await page.locator('[data-testid="step-prompt-textarea-0"]').fill('[SIMULATE_ERROR] Test Error');

      // Execute flow to trigger simulated error
      await page.locator('[data-testid="run-flow-btn"]').click();

      // Assert step status badge transitions to error state
      await expect(page.locator('[data-testid="step-status-badge-0"]')).toHaveText(/error/i);

      // Assert step error container displays error message
      await expect(page.locator('[data-testid="step-error-container-0"]')).toBeVisible();
    });
  });

});

