/**
 * The screen the workshop opens on. It must open in a working state: the deciding line selected,
 * the ruling of 3 November 2026 applied, and "no model chosen" said plainly.
 */
import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RunComparison } from './RunComparison';
import { runLabel } from './SavedRunInspector';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(React.createElement(RunComparison)));
  const q = (id: string) => container!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const click = async (id: string) => act(async () => q(id)!.click());
  return { q, click };
}

describe('run comparison screen', () => {
  it('opens on the deciding line under the ruling, and says no model is chosen', async () => {
    const { q } = await render();
    expect(q('no-model-chosen')!.textContent).toContain('No model chosen');
    expect(q('bedtime-ruling')!.textContent).toContain('At bedtime as needed: no fixed schedule, as needed, at most once a day.');
    expect(q('reading-ruling')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('sheet-row-s25')!.getAttribute('data-selected')).toBe('true');
    expect(q('line-detail-sig')!.textContent).toBe('Melatonin 3 mg tab - take 1 tablet by mouth at bedtime as needed for sleep');
    expect(q('detail-row-frequency')!.textContent).toContain('does not match');
    expect(q('plate-count-gpt-oss:20b')!.textContent).toBe('25/25');
    expect(q('plate-count-gemma4:31b')!.textContent).toBe('24/25');
    expect(q('plate-count-rules')!.textContent).toBe('25/25');
    expect(q('decision-panel')!.textContent).toContain('Leads on development data: gpt-oss:20b');
    expect(q('decision-panel')!.textContent).toContain('No model is chosen.');
  });

  it('flips with the reading and follows the set', async () => {
    const { q, click } = await render();
    await click('reading-first-gold');
    expect(q('plate-count-gpt-oss:20b')!.textContent).toBe('24/25');
    expect(q('plate-count-qwen3.8:27b')!.textContent).toBe('25/25');
    expect(q('decision-panel')!.textContent).toContain('Leads on development data: qwen3.8:27b');
    await click('set-templates12');
    expect(q('plate-count-gpt-oss:20b')!.textContent).toBe('10/12');
    expect(q('sheet-row-h02')!.getAttribute('data-selected')).toBe('true');
    expect(q('run-1')).toBeNull();
  });

  it('labels every verdict cell for a screen reader', async () => {
    const { q, click } = await render();
    expect(q('cell-s25-gemma4:31b')!.getAttribute('aria-label')).toBe('s25, gemma4:31b: frequency wrong');
    expect(q('cell-s01-gpt-oss:20b')!.getAttribute('aria-label')).toBe('s01, gpt-oss:20b: all six fields right');
    await click('cell-s25-gpt-oss:20b');
    expect(q('detail-column-gpt-oss:20b')!.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('saved audit run labels', () => {
  it('name each run plainly, with no file path or version number', () => {
    const labels = [
      runLabel('versions/v2/reports/empty.json', 'empty'),
      runLabel('versions/v2/reports/rules.json', 'rules'),
      runLabel('versions/v2/local-20261101/report-pass2-gemma4_31b.json', 'gemma4:31b'),
      runLabel('versions/v2/local-20261101-corrected/pass1-qwen3_8_27b-inspection.json', null),
    ];
    expect(labels).toEqual(['Empty control, predicts nothing', 'Narrow rules control', 'gemma4:31b, pass 2, failed at the endpoint', 'qwen3.8:27b, pass 1, stopped after 23 of 42 requests']);
    for (const label of labels) expect(label).not.toMatch(/\bv\d\b|versions\/|\.json/);
  });
});
