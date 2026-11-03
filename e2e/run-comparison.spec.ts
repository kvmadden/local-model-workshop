import { test, expect } from './fixtures';
import { TABS, SECTION_OF, openView } from './sweep';
import { auditCalm } from './audits';

/**
 * The screen the workshop opens on, and Kevin's rules for it: show less at once (the finding, one
 * picture and one next step), three sections instead of eight tabs, deliberate layouts that use
 * the width at 1920, 1440 and 1024, nothing floating over the content, and a calm screen with
 * some character: one display face for headlines, red only for a missed field.
 */
test.use({ engineMode: 'absent' });

const box = async (page: import('@playwright/test').Page, id: string) => (await page.getByTestId(id).boundingBox())!;

test('the workshop opens on the finding alone: headline, why, status, the four results and one next step', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('run-comparison')).toBeVisible();
  await expect(page.getByTestId('section-results')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('tab-run-comparison')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('comparison-headline')).toHaveText('A simple rules parser does as well as every model, so these lines can’t pick one.');
  await expect(page.getByTestId('comparison-lede')).toHaveText(
    'All four read 24 or 25 of the 25 development lines fully right, and every miss is the frequency on the one line that says “at bedtime as needed”.',
  );
  await expect(page.getByTestId('no-model-chosen')).toHaveText('No model chosen yet, and none will be until the new blind test set runs.');
  await expect(page.getByTestId('count-gpt-oss:20b')).toHaveText('25 of 25');
  await expect(page.getByTestId('count-gemma4:31b')).toHaveText('24 of 25');
  await expect(page.getByTestId('count-qwen3.8:27b')).toHaveText('24 of 25');
  await expect(page.getByTestId('count-rules')).toHaveText('25 of 25');
  await expect(page.getByTestId('see-every-line')).toBeVisible();
  // Everything else waits for the next step.
  for (const id of ['line-sheet', 'line-detail', 'options', 'per-field', 'bedtime-ruling']) await expect(page.getByTestId(id)).toHaveCount(0);
  // No developer badges or iteration numbers on the screen.
  expect(await page.getByTestId('app-container').innerText()).not.toMatch(/\b(scorer|evaluator|bench) v?\d\b|\bv[0-9]\b|iteration/i);
});

test('See every line opens the sheet on the deciding line, with the ruling, and leads back', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('see-every-line').click();
  await expect(page.getByTestId('comparison-overview')).toHaveCount(0);
  await expect(page.getByTestId('sheet-row-s25')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('line-detail-sig')).toHaveText('Melatonin 3 mg tab - take 1 tablet by mouth at bedtime as needed for sleep');
  await expect(page.getByTestId('bedtime-ruling')).toContainText('“at bedtime as needed” means no fixed schedule, as needed, at most once a day.');
  await expect(page.getByTestId('ruling-details')).toContainText('The schedule and the as-needed maximum are separate fields.');
  // The other set, the other reading and run 2 wait behind one closed disclosure.
  await expect(page.getByTestId('set-templates12')).toBeHidden();
  await page.getByTestId('options-toggle').click();
  await expect(page.getByTestId('set-templates12')).toBeVisible();
  await page.getByRole('link', { name: 'About the ruling' }).click();
  await expect(page.getByTestId('ruling-details')).toBeInViewport();
  await expect(page.getByTestId('ruling-details')).toContainText('Kevin Madden, PharmD');
  await page.getByTestId('back-to-overview').click();
  await expect(page.getByTestId('comparison-overview')).toBeVisible();
});

test('three sections hold every view, and a section reopens on the view last used in it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid="workshop-sections"] button')).toHaveText(['Results', 'Try it', 'Reference']);
  const containers: Record<string, string> = {
    'tab-run-comparison': 'run-comparison',
    'tab-benchmark-studio': 'benchmark-studio-container',
    'tab-task-wizard': 'task-wizard-container',
    'tab-use-case-studio': 'use-case-studio-container',
    'tab-flow-builder': 'flow-canvas',
    'tab-model-catalog': 'model-catalog-container',
    'tab-hardware-advisor': 'hardware-advisor-container',
    'tab-shortcuts-studio': 'shortcuts-studio-container',
  };
  for (const view of TABS) {
    await openView(page, view);
    await expect(page.getByTestId(containers[view])).toBeVisible();
    await expect(page.getByTestId(SECTION_OF[view])).toHaveAttribute('aria-current', 'page');
    // Only the open section's views are offered: two or three, never eight.
    expect(await page.locator('[data-testid="workshop-nav-tabs"] button').count()).toBeLessThanOrEqual(3);
  }
  await openView(page, 'tab-hardware-advisor');
  await page.getByTestId('section-results').click();
  await page.getByTestId('section-reference').click();
  await expect(page.getByTestId('tab-hardware-advisor')).toHaveAttribute('aria-current', 'page');
});

// The calm audit has to catch what it is meant to catch, or an empty list proves nothing.
test('the calm audit flags capitals, a display face off a heading, monospace prose, stray red and a heavy rule', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('run-comparison')).toBeVisible();
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.setAttribute('data-testid', 'audit-controls');
    host.innerHTML = `
      <p style="text-transform:uppercase">Loud label</p>
      <p style="font-family:'Bricolage Grotesque Variable'">Display body text</p>
      <h3 style="font-family:'Bricolage Grotesque Variable'">A display heading</h3>
      <p style="font-family:'Atkinson Hyperlegible Mono'">Body text in mono</p>
      <p style="color:rgb(var(--alert-text))">Red that is not a miss</p>
      <div style="border:2px solid currentColor">Heavy box</div>
      <p class="sig">take 1 tablet by mouth daily</p>
      <p data-miss style="color:rgb(var(--alert-text))">Frequency</p>`;
    document.querySelector('[data-testid="run-comparison"]')!.prepend(host);
  });
  const report = await page.evaluate(auditCalm);
  expect(report.caps).toEqual(['Loud label']);
  expect(report.display).toEqual(['Display body text']);
  expect(report.mono).toEqual(['Body text in mono']);
  expect(report.red).toEqual(['Red that is not a miss']);
  expect(report.heavy).toEqual(['div 2/2/2/2']);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`both steps stay calm in the ${colorScheme} theme: sentence case, display face on headings, monospace only for medication lines, thin rules, red only for a miss`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await expect(page.getByTestId('comparison-overview')).toBeVisible();
    const overview = await page.evaluate(auditCalm);
    expect(overview.faces.sort()).toEqual(['Atkinson Hyperlegible Next', 'Bricolage Grotesque Variable']);
    await page.getByTestId('see-every-line').click();
    await page.getByTestId('per-field-toggle').click();
    await page.getByTestId('options-toggle').click();
    const lines = await page.evaluate(auditCalm);
    expect(lines.faces.sort()).toEqual(['Atkinson Hyperlegible Mono', 'Atkinson Hyperlegible Next', 'Bricolage Grotesque Variable']);
    for (const report of [overview, lines]) {
      expect(report.caps).toEqual([]);
      expect(report.display).toEqual([]);
      expect(report.mono).toEqual([]);
      expect(report.red).toEqual([]);
      expect(report.heavy).toEqual([]);
    }
  });
}

test('no view sets its labels in forced capitals', async ({ page }) => {
  await page.goto('/');
  const caps: string[] = [];
  for (const tab of TABS) {
    await openView(page, tab);
    caps.push(...(await page.evaluate(() =>
      Array.from(document.querySelectorAll('body *'))
        .filter((el) => getComputedStyle(el).textTransform === 'uppercase' && (el as HTMLElement).innerText?.trim())
        .map((el) => (el as HTMLElement).innerText.trim().slice(0, 30)),
    )).map((t) => `${tab}: ${t}`));
  }
  expect(caps).toEqual([]);
});

test('wide screens get a composed opening that uses the width, and phones the same story in one column', async ({ page }) => {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const intro = await box(page, 'comparison-intro');
    const chart = await box(page, 'comparison-results');
    const next = await box(page, 'see-every-line');
    // The finding and its picture sit side by side, the picture is substantial, and all of it fits the first screen.
    expect(intro.x + intro.width, `${viewport.width}`).toBeLessThanOrEqual(chart.x);
    expect(chart.width, `${viewport.width}`).toBeGreaterThan(viewport.width * 0.35);
    expect(chart.x + chart.width - intro.x, `${viewport.width}`).toBeGreaterThan(viewport.width * 0.8);
    for (const [name, b] of [['chart', chart], ['next step', next]] as const) expect(b.y + b.height, `${name} at ${viewport.width}`).toBeLessThanOrEqual(viewport.height);
    // Sections and views each sit on one row.
    for (const nav of ['workshop-sections', 'workshop-nav-tabs']) {
      const tops = await page.locator(`[data-testid="${nav}"] button`).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size, `${nav} at ${viewport.width}`).toBe(1);
    }
  }

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByTestId('see-every-line').click();
    const sheet = await box(page, 'line-sheet');
    const detail = await box(page, 'line-detail');
    expect(sheet.x + sheet.width, `${viewport.width}`).toBeLessThanOrEqual(detail.x);
    expect(detail.x + detail.width - sheet.x, `${viewport.width}`).toBeGreaterThan(viewport.width * (viewport.width >= 1920 ? 0.8 : 0.85));
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  let order = ['comparison-intro', 'comparison-results', 'see-every-line'];
  let boxes = await Promise.all(order.map((id) => box(page, id)));
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].y, order[i]).toBeGreaterThan(boxes[i - 1].y + boxes[i - 1].height - 1);
  for (const id of ['comparison-intro', 'comparison-results']) expect((await box(page, id)).width, id).toBeGreaterThan(340);
  for (const nav of ['workshop-sections', 'workshop-nav-tabs']) {
    const tops = await page.locator(`[data-testid="${nav}"] button`).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size, `${nav} at 390`).toBe(1);
  }
  await page.getByTestId('see-every-line').click();
  order = ['line-detail', 'line-sheet'];
  boxes = await Promise.all(order.map((id) => box(page, id)));
  expect(boxes[1].y).toBeGreaterThan(boxes[0].y + boxes[0].height - 1);
  for (const b of boxes) expect(b.width).toBeGreaterThan(340);
});

test('nothing floats over the content: no fixed controls, and the sticky detail never covers the sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const fixed: string[] = [];
  for (const tab of TABS) {
    await openView(page, tab);
    fixed.push(...(await page.evaluate(() =>
      Array.from(document.querySelectorAll('body *'))
        .filter((el) => getComputedStyle(el).position === 'fixed' && !el.closest('[role="dialog"]') && el.getBoundingClientRect().width > 0)
        .map((el) => el.getAttribute('data-testid') ?? el.tagName.toLowerCase()),
    )).map((name) => `${tab}: ${name}`));
  }
  expect(fixed).toEqual([]);

  await openView(page, 'tab-run-comparison');
  await page.getByTestId('see-every-line').click();
  for (const y of [0, 600, 1200, 1800]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    const sheet = await box(page, 'line-sheet');
    const detail = await box(page, 'line-detail');
    expect(detail.x, `line-detail at scroll ${y}`).toBeGreaterThanOrEqual(sheet.x + sheet.width);
  }
});
