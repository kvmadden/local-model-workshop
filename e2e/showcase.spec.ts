import { test, expect } from './fixtures'

// Start dark, so the test can switch to the light theme by keyboard.
test.use({ colorScheme: 'dark' })

test('light flow editor works by keyboard at portfolio viewports', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 430, height: 932 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    // The theme choice is remembered. Clear it so every viewport starts from the system setting.
    await page.evaluate(() => localStorage.removeItem('local-model-workshop-theme'))
    await page.reload()
    await page.getByTestId('tab-flow-builder').click()
    const theme = page.getByRole('button', { name: 'Use light theme' })
    await expect(theme).toBeVisible()
    await theme.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('app-container')).toHaveAttribute('data-theme', 'light')
    await page.getByTestId('initial-input-textarea').fill('Fictional workshop note: explain the project in one sentence.')
    await page.getByTestId('run-flow-btn').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('flow-status-badge')).toHaveText('completed')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const id of ['run-flow-btn', 'add-step-btn']) {
      const bounds = await page.getByTestId(id).boundingBox()
      expect(bounds!.height).toBeGreaterThanOrEqual(44)
      expect(bounds!.width).toBeGreaterThanOrEqual(44)
    }
    if (process.env.CAPTURE_SHOWCASE === '1') {
      await page.screenshot({ path: `docs/media/flow-light-${viewport.width}.png`, fullPage: true })
    }
  }
})
