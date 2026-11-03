import { test, expect } from './fixtures';
import { auditBoxesAndFlows } from './audits';
import { TABS, VIEWPORTS } from './sweep';

/**
 * Kevin's layout rules, checked on every tab in both themes:
 * 1. Boxed text (pills, chips, badges, stickers, buttons) keeps clear room inside its border, and
 *    nothing is clipped.
 * 2. A step flow sits on one line or stacks cleanly. It never wraps partway.
 */
test.use({ engineMode: 'absent' });


// The audit has to catch what it is meant to catch, or an empty list proves nothing.
test('the audit flags a tight pill, a clipped pill, a tight ring and a flow that wraps partway, and passes clean ones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.setAttribute('data-testid', 'audit-controls');
    host.style.cssText = 'width:300px;padding:8px';
    host.innerHTML = `
      <span style="border:1px solid #000;padding:2px 1px;display:inline-block">TIGHT</span>
      <span style="border:1px solid #000;padding:4px 8px;display:inline-block;width:40px;overflow:hidden;white-space:nowrap">CLIPPED LABEL</span>
      <span style="border:1px solid #000;padding:4px 8px;display:inline-block">ROOMY</span>
      <span style="box-shadow:inset 0 0 0 1.5px #000;padding:2px 1px;display:inline-block">RINGED</span>
      <ol data-step-flow style="display:flex;flex-wrap:wrap;width:220px;list-style:none;padding:0;margin:8px 0">
        <li data-step style="white-space:nowrap">Assistant</li><li>→</li><li data-step style="white-space:nowrap">Screening</li><li>→</li><li data-step style="white-space:nowrap">Shared knowledge</li>
      </ol>
      <ol data-step-flow style="display:flex;flex-direction:column;list-style:none;padding:0;margin:8px 0">
        <li data-step>Assistant</li><li data-step>Screening</li><li data-step>Shared knowledge</li>
      </ol>
      <p style="width:120px">Open the app → choose a model → run the flow</p>`;
    document.body.prepend(host);
  });
  const { boxes, flows } = await page.evaluate(auditBoxesAndFlows);
  const mine = (list: string[]) => list.filter((x) => x.includes('audit-controls'));
  expect(mine(boxes).some((b) => b.includes('"TIGHT"'))).toBe(true);
  expect(mine(boxes).some((b) => b.includes('"CLIPPED LABEL"') && b.includes('clipped'))).toBe(true);
  expect(mine(boxes).some((b) => b.includes('"ROOMY"'))).toBe(false);
  expect(mine(boxes).some((b) => b.includes('"RINGED"'))).toBe(true);
  expect(mine(flows)).toEqual([
    'ol in audit-controls: steps wrap partway',
    'p in audit-controls: "Open the app → choose a model → run the " wraps an arrow flow across lines',
  ]);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`layout rules, ${colorScheme} theme`, () => {
    test.use({ colorScheme });
    for (const viewport of VIEWPORTS) {
      test(`boxed text keeps its padding and step flows never wrap partway at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto('/');
        await expect(page.getByTestId('app-container')).toHaveAttribute('data-theme', colorScheme);
        const problems: string[] = [];
        for (const tab of TABS) {
          await page.getByTestId(tab).click();
          await page.waitForTimeout(150);
          const { boxes, flows } = await page.evaluate(auditBoxesAndFlows);
          problems.push(...boxes.map((b) => `${tab}: ${b}`), ...flows.map((f) => `${tab}: ${f}`));
        }
        // States past the first view of each tab: other sets and readings, dialogs, a finished run.
        const states: Array<{ name: string; tab: string; act: () => Promise<void>; after?: () => Promise<void> }> = [
          { name: 'per field and options open, template lines, gold as first written', tab: 'tab-run-comparison', act: async () => {
            await page.getByTestId('per-field-toggle').click();
            await page.getByTestId('options-toggle').click();
            await page.getByTestId('set-templates12').click();
            await page.getByTestId('reading-first-gold').click();
            await page.getByTestId('cell-h02-gpt-oss:20b').click();
          } },
          { name: 'task setup dialog', tab: 'tab-task-wizard', act: async () => { await page.getByTestId('view-setup-guide-btn').click(); }, after: async () => { await page.keyboard.press('Escape'); } },
          { name: 'model setup dialog', tab: 'tab-model-catalog', act: async () => { await page.locator('[data-testid^="setup-modal-btn-"]').first().click(); }, after: async () => { await page.keyboard.press('Escape'); } },
          { name: 'incomplete audit run', tab: 'tab-benchmark-studio', act: async () => {
            await page.getByTestId('audit-run').selectOption('versions/v2/local-20261101-corrected/pass1-qwen3_8_27b-inspection.json');
            await page.getByTestId('audit-case').selectOption('p16');
          } },
          { name: 'finished flow run', tab: 'tab-flow-builder', act: async () => {
            await page.getByTestId('run-flow-btn').click();
            await expect(page.getByTestId('flow-status-badge')).toHaveText('completed');
          } },
        ];
        for (const state of states) {
          await page.getByTestId(state.tab).click();
          await state.act();
          await page.waitForTimeout(150);
          const { boxes, flows } = await page.evaluate(auditBoxesAndFlows);
          problems.push(...boxes.map((b) => `${state.name}: ${b}`), ...flows.map((f) => `${state.name}: ${f}`));
          await state.after?.();
        }
        expect(problems).toEqual([]);
      });
    }
  });
}
