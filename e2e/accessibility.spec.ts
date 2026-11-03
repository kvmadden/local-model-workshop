import { test, expect } from './fixtures';
import { auditContrast, auditTargets } from './audits';
import { TABS, VIEWPORTS, openView } from './sweep';

/**
 * Accessibility checks on every tab in both themes: text contrast measured on the rendered page,
 * 44 px targets, no sideways scrolling, a visible focus mark, and the run comparison worked by
 * keyboard alone.
 */
test.use({ engineMode: 'absent' });

// The audits have to catch what they are meant to catch, or an empty list proves nothing.
test('the audits flag low contrast and a small target, and pass clean ones', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.setAttribute('data-testid', 'audit-controls');
    host.style.cssText = 'background:#ffffff;padding:8px';
    host.innerHTML = `
      <p style="color:#aaaaaa;font-size:14px">Faint grey text</p>
      <p style="color:#111111;font-size:14px">Dark text</p>
      <button style="width:30px;height:30px">x</button>
      <button style="width:48px;height:48px">ok</button>`;
    document.body.prepend(host);
  });
  const contrast = (await page.evaluate(auditContrast)).filter((p) => p.includes('audit-controls'));
  const targets = (await page.evaluate(auditTargets)).filter((p) => p.includes('audit-controls'));
  expect(contrast).toHaveLength(1);
  expect(contrast[0]).toContain('Faint grey text');
  expect(targets).toEqual(['button audit-controls "x": 30x30']);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`accessibility, ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const viewport of [VIEWPORTS[1], VIEWPORTS[4]]) {
      test(`every tab meets text contrast and 44 px targets at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto('/');
        await expect(page.getByTestId('app-container')).toHaveAttribute('data-theme', colorScheme);
        const problems: string[] = [];
        for (const tab of TABS) {
          await openView(page, tab);
          await page.waitForTimeout(150);
          problems.push(...(await page.evaluate(auditContrast)).map((p) => `${tab} contrast: ${p}`));
          problems.push(...(await page.evaluate(auditTargets)).map((p) => `${tab} target: ${p}`));
        }
        // The second step of the run comparison, with both disclosures open.
        await openView(page, 'tab-run-comparison');
        await page.getByTestId('see-every-line').click();
        await page.getByTestId('per-field-toggle').click();
        await page.getByTestId('options-toggle').click();
        problems.push(...(await page.evaluate(auditContrast)).map((p) => `every line contrast: ${p}`));
        problems.push(...(await page.evaluate(auditTargets)).map((p) => `every line target: ${p}`));
        expect(problems).toEqual([]);
      });
    }

    test('no tab scrolls sideways at any size', async ({ page }) => {
      const problems: string[] = [];
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await page.goto('/');
        for (const tab of TABS) {
          await openView(page, tab);
          if (!(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))) problems.push(`${tab} at ${viewport.width}x${viewport.height}`);
        }
      }
      expect(problems).toEqual([]);
    });
  });
}

test('keyboard focus is always visible on both steps of the run comparison', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('run-comparison')).toBeVisible();
  const unmarked: string[] = [];
  const walk = async (steps: number) => {
    for (let i = 0; i < steps; i++) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
        const ring = cs.boxShadow !== 'none' && /\d+px/.test(cs.boxShadow);
        return { name: el.getAttribute('data-testid') ?? el.textContent?.trim().slice(0, 24) ?? el.tagName, marked: outline || ring };
      });
      if (state && !state.marked) unmarked.push(state.name);
    }
  };
  await walk(12);
  await page.getByTestId('see-every-line').click();
  await walk(40);
  expect(unmarked).toEqual([]);
});

test('the run comparison works by keyboard alone', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('count-gpt-oss:20b')).toHaveText('25 of 25');
  // The one next step, by keyboard. Focus moves to the new step's title.
  await page.getByTestId('see-every-line').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('line-sheet')).toBeVisible();
  await expect(page.locator('#run-comparison-title')).toBeFocused();
  // Open the options with the keyboard, then move the reading with the arrow keys.
  await page.getByTestId('options-toggle').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('reading-ruling').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('reading-first-gold')).toBeChecked();
  await expect(page.getByTestId('field-gpt-oss:20b-frequency')).toHaveText('24');
  // Pick a verdict cell with the keyboard, and the detail follows.
  await page.getByTestId('cell-s25-gpt-oss:20b').focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('detail-column-gpt-oss:20b')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('detail-row-frequency')).toContainText('does not match');
  // And the set, then back to the overview, which follows both choices.
  await page.getByTestId('set-dev25').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('set-templates12')).toBeChecked();
  await page.getByTestId('back-to-overview').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('count-gpt-oss:20b')).toHaveText('10 of 12');
});
