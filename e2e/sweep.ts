import type { Page } from '@playwright/test';

/** The sizes and views every layout and accessibility sweep covers. */
export const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 430, height: 932 },
  { width: 390, height: 844 },
];

/** Every view, by the test id of its button, in navigation order. */
export const TABS = [
  'tab-run-comparison',
  'tab-benchmark-studio',
  'tab-task-wizard',
  'tab-use-case-studio',
  'tab-flow-builder',
  'tab-model-catalog',
  'tab-hardware-advisor',
  'tab-shortcuts-studio',
];

/** The section each view sits in. The header shows three sections, and the open section's views. */
export const SECTION_OF: Record<string, string> = {
  'tab-run-comparison': 'section-results',
  'tab-benchmark-studio': 'section-results',
  'tab-task-wizard': 'section-try',
  'tab-use-case-studio': 'section-try',
  'tab-flow-builder': 'section-try',
  'tab-model-catalog': 'section-reference',
  'tab-hardware-advisor': 'section-reference',
  'tab-shortcuts-studio': 'section-reference',
};

/** Open a view the way a person does: its section first, then the view. */
export async function openView(page: Page, view: string) {
  await page.getByTestId(SECTION_OF[view]).click();
  await page.getByTestId(view).click();
}
