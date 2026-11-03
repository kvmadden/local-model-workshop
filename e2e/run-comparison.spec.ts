import { test, expect } from './fixtures';
import { TABS } from './sweep';

/**
 * The screen the workshop opens on, and Kevin's desktop rule: deliberate layouts that use the
 * width at 1920, 1440 and 1024, not a phone column, and nothing floating over the content.
 */
test.use({ engineMode: 'absent' });

const box = async (page: import('@playwright/test').Page, id: string) => (await page.getByTestId(id).boundingBox())!;

test('the workshop opens on the run comparison in a working state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('run-comparison')).toBeVisible();
  await expect(page.getByTestId('tab-run-comparison')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('no-model-chosen')).toContainText('No model chosen');
  await expect(page.getByTestId('no-model-chosen')).toContainText('until the new blind test set runs');
  await expect(page.getByTestId('bedtime-ruling')).toContainText('At bedtime as needed: no fixed schedule, as needed, at most once a day.');
  await expect(page.getByTestId('bedtime-ruling')).toContainText('The schedule and the as-needed maximum are separate fields.');
  await expect(page.getByTestId('sheet-row-s25')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('line-detail-sig')).toHaveText('Melatonin 3 mg tab - take 1 tablet by mouth at bedtime as needed for sleep');
  await expect(page.getByTestId('plate-count-gpt-oss:20b')).toHaveText('25/25');
  await expect(page.getByTestId('plate-count-gemma4:31b')).toHaveText('24/25');
  await expect(page.getByTestId('plate-count-qwen3.8:27b')).toHaveText('24/25');
  await expect(page.getByTestId('plate-count-rules')).toHaveText('25/25');
  await expect(page.getByTestId('decision-panel')).toContainText('No model is chosen. The blind test set decides');
  // No developer badges or iteration numbers on the screen.
  expect(await page.getByTestId('app-container').innerText()).not.toMatch(/\b(scorer|evaluator|bench) v?\d\b|\bv[0-9]\b|iteration/i);
});

test('desktop and laptop layouts use the width, and phones get one clean column', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  const main = (await page.locator('main').boundingBox())!;
  expect(main.width).toBeGreaterThan(1700);
  let rail = await box(page, 'comparison-rail');
  let sheet = await box(page, 'verification-sheet');
  let detail = await box(page, 'line-detail');
  expect(rail.x + rail.width).toBeLessThanOrEqual(sheet.x);
  expect(sheet.x + sheet.width).toBeLessThanOrEqual(detail.x);
  expect(Math.abs(rail.y - sheet.y)).toBeLessThan(2);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    sheet = await box(page, 'verification-sheet');
    detail = await box(page, 'line-detail');
    expect(sheet.x + sheet.width, `${viewport.width}`).toBeLessThanOrEqual(detail.x);
    expect(Math.abs(sheet.y - detail.y), `${viewport.width}`).toBeLessThan(2);
    expect(sheet.width + detail.width, `${viewport.width}`).toBeGreaterThan(viewport.width * 0.85);
    // All tabs on one row from laptop width up.
    const tops = await page.locator('[data-testid="workshop-nav-tabs"] button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size, `${viewport.width}`).toBe(1);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  rail = await box(page, 'comparison-rail');
  sheet = await box(page, 'verification-sheet');
  detail = await box(page, 'line-detail');
  expect(detail.y).toBeGreaterThan(rail.y + rail.height - 1);
  expect(sheet.y).toBeGreaterThan(detail.y + detail.height - 1);
  for (const b of [rail, sheet, detail]) expect(b.width).toBeGreaterThan(340);
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
    const sheet = await box(page, 'verification-sheet');
    for (const id of ['line-detail', 'decision-panel']) {
      const panel = await box(page, id);
      expect(panel.x, `${id} at scroll ${y}`).toBeGreaterThanOrEqual(sheet.x + sheet.width);
    }
  }
});
