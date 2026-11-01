import { test, expect } from './fixtures'

test('saved audit exposes rights, spans and fixed failures by keyboard', async ({ page }) => {
  test.setTimeout(90000)
  for (const viewport of [{ width: 1440, height: 900 }, { width: 430, height: 932 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.getByTestId('tab-benchmark-studio').click()
    const inspector = page.getByTestId('saved-run-inspector')
    await expect(inspector).toBeVisible()
    await expect(inspector.getByText('Draft · pharmacist review pending')).toBeVisible()
    await expect(inspector.getByRole('link', { name: 'CC0-1.0', exact: true })).toHaveAttribute('href', 'https://open.fda.gov/license/')
    const select = page.getByTestId('audit-case')
    await select.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await select.selectOption('p01')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const control of await inspector.locator('button, select, summary, a').all()) {
      if (!await control.isVisible()) continue
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.getByRole('button', { name: 'Use light theme' }).click()
      if (process.env.CAPTURE_AUDIT === '1') {
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: `docs/media/audit-${theme}-${viewport.width}.png`, fullPage: false })
        if (viewport.width === 1440 && theme === 'light') {
          await page.screenshot({ path: 'docs/media/audit-frame-1.png' })
          await select.selectOption('p19')
          await page.screenshot({ path: 'docs/media/audit-frame-2.png' })
          await inspector.getByText('Exact spans and derivations', { exact: true }).click()
          await inspector.getByText('Exact spans and derivations', { exact: true }).scrollIntoViewIfNeeded()
          await page.screenshot({ path: 'docs/media/audit-frame-3.png' })
        }
      }
    }
    await select.selectOption('c04')
    if (!await inspector.locator('details').last().getAttribute('open').then(v => v !== null)) await inspector.getByText('Exact spans and derivations', { exact: true }).click()
    await expect(inspector.getByText('Multiply 12.5 × 0.5 = 6.25 mg')).toBeVisible()
    await page.getByTestId('audit-run').selectOption('versions/v2/reports/empty.json')
    await expect(inspector.getByText('None', { exact: true }).first()).toBeVisible()
    await page.getByTestId('audit-run').selectOption('versions/v2/reports/everything.json')
    await expect(inspector.getByRole('link', { name: 'Complete errors and intervals' })).toHaveAttribute('href', /reports\/everything.json$/)
  }
})


test('incomplete real acquisition exposes its reply and keeps aggregates unmeasured', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-benchmark-studio').click()
  await page.getByTestId('audit-run').selectOption('versions/v2/local-20261101-corrected/pass1-qwen3_8_27b-inspection.json')
  await page.getByTestId('audit-case').selectOption('p16')
  const inspector = page.getByTestId('saved-run-inspector')
  await expect(inspector.getByText('Unmeasured, incomplete acquisition')).toBeVisible()
  await expect(inspector.getByText(/Model digest:/)).not.toContainText('N/A')
  await inspector.getByText('Original saved model reply', { exact: true }).click()
  await expect(inspector.getByText('Original saved model reply', { exact: true }).locator('..').locator('pre')).toBeVisible()
})
