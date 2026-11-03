import { test, expect } from './fixtures';
import { TABS } from './sweep';
import { auditCalm } from './audits';

/**
 * The screen the workshop opens on, Kevin's desktop rule (deliberate layouts that use the width at
 * 1920, 1440 and 1024, nothing floating over the content) and his ask for a calm, readable screen:
 * one headline first, one compact table, quiet type, and red only for a missed field.
 */
test.use({ engineMode: 'absent' });

const box = async (page: import('@playwright/test').Page, id: string) => (await page.getByTestId(id).boundingBox())!;

test('the workshop opens on the run comparison in a working state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('run-comparison')).toBeVisible();
  await expect(page.getByTestId('tab-run-comparison')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('comparison-headline')).toHaveText(
    "Three local models and a simple rules parser each read 24 or 25 of the 25 development lines fully right, so these lines can’t pick a model.",
  );
  await expect(page.getByTestId('no-model-chosen')).toHaveText('No model chosen yet, and none will be until the new blind test set runs.');
  await expect(page.getByTestId('bedtime-ruling')).toContainText('“at bedtime as needed” means no fixed schedule, as needed, at most once a day.');
  await expect(page.getByTestId('ruling-details')).toContainText('The schedule and the as-needed maximum are separate fields.');
  await expect(page.getByTestId('sheet-row-s25')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('line-detail-sig')).toHaveText('Melatonin 3 mg tab - take 1 tablet by mouth at bedtime as needed for sleep');
  await expect(page.getByTestId('count-gpt-oss:20b')).toHaveText('25 of 25');
  await expect(page.getByTestId('count-gemma4:31b')).toHaveText('24 of 25');
  await expect(page.getByTestId('count-qwen3.8:27b')).toHaveText('24 of 25');
  await expect(page.getByTestId('count-rules')).toHaveText('25 of 25');
  // The other set, the other reading and run 2 wait behind one closed disclosure.
  await expect(page.getByTestId('set-templates12')).toBeHidden();
  await page.getByTestId('options-toggle').click();
  await expect(page.getByTestId('set-templates12')).toBeVisible();
  // No developer badges or iteration numbers on the screen.
  expect(await page.getByTestId('app-container').innerText()).not.toMatch(/\b(scorer|evaluator|bench) v?\d\b|\bv[0-9]\b|iteration/i);
});

test('the one-line ruling note links to the details', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'About the ruling' }).click();
  await expect(page.getByTestId('ruling-details')).toBeInViewport();
  await expect(page.getByTestId('ruling-details')).toContainText('Kevin Madden, PharmD');
});

// The calm audit has to catch what it is meant to catch, or an empty list proves nothing.
test('the calm audit flags capitals, monospace prose, stray red and a heavy rule, and passes clean text', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('run-comparison')).toBeVisible();
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.setAttribute('data-testid', 'audit-controls');
    host.innerHTML = `
      <p style="text-transform:uppercase">Loud label</p>
      <p style="font-family:'Atkinson Hyperlegible Mono'">Body text in mono</p>
      <p style="color:rgb(var(--alert-text))">Red that is not a miss</p>
      <div style="border:2px solid currentColor">Heavy box</div>
      <p class="sig">take 1 tablet by mouth daily</p>
      <p data-miss style="color:rgb(var(--alert-text))">Frequency</p>`;
    document.querySelector('[data-testid="run-comparison"]')!.prepend(host);
  });
  const report = await page.evaluate(auditCalm);
  expect(report.caps).toEqual(['Loud label']);
  expect(report.mono).toEqual(['Body text in mono']);
  expect(report.red).toEqual(['Red that is not a miss']);
  expect(report.heavy).toEqual(['div 2/2/2/2']);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the screen stays calm in the ${colorScheme} theme: one face in sentence case, monospace only for medication lines, thin rules, red only for a miss`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await page.getByTestId('per-field-toggle').click();
    await page.getByTestId('options-toggle').click();
    const report = await page.evaluate(auditCalm);
    expect(report.caps).toEqual([]);
    expect(report.faces.sort()).toEqual(['Atkinson Hyperlegible Mono', 'Atkinson Hyperlegible Next']);
    expect(report.mono).toEqual([]);
    expect(report.red).toEqual([]);
    expect(report.heavy).toEqual([]);
  });
}

test('no tab sets its labels in forced capitals', async ({ page }) => {
  await page.goto('/');
  const caps: string[] = [];
  for (const tab of TABS) {
    await page.getByTestId(tab).click();
    caps.push(...(await page.evaluate(() =>
      Array.from(document.querySelectorAll('body *'))
        .filter((el) => getComputedStyle(el).textTransform === 'uppercase' && (el as HTMLElement).innerText?.trim())
        .map((el) => (el as HTMLElement).innerText.trim().slice(0, 30)),
    )).map((t) => `${tab}: ${t}`));
  }
  expect(caps).toEqual([]);
});

test('desktop and laptop layouts use the width, and phones get one clean column', async ({ page }) => {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const intro = await box(page, 'comparison-intro');
    const results = await box(page, 'comparison-results');
    // The finding and its table sit side by side, and the page spans the screen.
    expect(intro.x + intro.width, `${viewport.width}`).toBeLessThanOrEqual(results.x);
    expect(Math.abs(intro.y - results.y), `${viewport.width}`).toBeLessThan(8);
    expect(results.x + results.width - intro.x, `${viewport.width}`).toBeGreaterThan(viewport.width * 0.8);
  }

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    const sheet = await box(page, 'line-sheet');
    const detail = await box(page, 'line-detail');
    expect(sheet.x + sheet.width, `${viewport.width}`).toBeLessThanOrEqual(detail.x);
    expect(detail.x + detail.width - sheet.x, `${viewport.width}`).toBeGreaterThan(viewport.width * (viewport.width >= 1920 ? 0.8 : 0.85));
    // All tabs on one row from laptop width up.
    const tops = await page.locator('[data-testid="workshop-nav-tabs"] button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size, `${viewport.width}`).toBe(1);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const order = ['comparison-intro', 'comparison-results', 'line-detail', 'line-sheet'];
  const boxes = await Promise.all(order.map((id) => box(page, id)));
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].y, order[i]).toBeGreaterThan(boxes[i - 1].y + boxes[i - 1].height - 1);
  for (const [i, b] of boxes.entries()) expect(b.width, order[i]).toBeGreaterThan(340);
});

test('nothing floats over the content: no fixed controls, and the sticky detail never covers the sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const fixed: string[] = [];
  for (const tab of TABS) {
    await page.getByTestId(tab).click();
    fixed.push(...(await page.evaluate(() =>
      Array.from(document.querySelectorAll('body *'))
        .filter((el) => getComputedStyle(el).position === 'fixed' && !el.closest('[role="dialog"]') && el.getBoundingClientRect().width > 0)
        .map((el) => el.getAttribute('data-testid') ?? el.tagName.toLowerCase()),
    )).map((name) => `${tab}: ${name}`));
  }
  expect(fixed).toEqual([]);

  await page.getByTestId('tab-run-comparison').click();
  for (const y of [0, 600, 1200, 1800]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    const sheet = await box(page, 'line-sheet');
    const detail = await box(page, 'line-detail');
    expect(detail.x, `line-detail at scroll ${y}`).toBeGreaterThanOrEqual(sheet.x + sheet.width);
  }
});
