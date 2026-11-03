/**
 * The screen the workshop opens on. It shows the finding and nothing else: one headline, one
 * sentence why, "no model chosen" said plainly, the four results and one next step. Every line,
 * the ruling and the options are the next step, opened on the deciding line.
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
  it('opens on the finding alone: one headline, one sentence why, the status and the four results', async () => {
    const { q } = await render();
    expect(q('comparison-headline')!.textContent).toBe('A simple rules parser does as well as every model, so these lines can’t pick one.');
    expect(q('comparison-lede')!.textContent).toBe(
      'All four read 24 or 25 of the 25 development lines fully right, and every miss is the frequency on the one line that says “at bedtime as needed”.',
    );
    expect(q('no-model-chosen')!.textContent).toBe('No model chosen yet, and none will be until the new blind test set runs.');
    expect(q('count-gpt-oss:20b')!.textContent).toBe('25 of 25');
    expect(q('count-gemma4:31b')!.textContent).toBe('24 of 25');
    expect(q('count-qwen3.8:27b')!.textContent).toBe('24 of 25');
    expect(q('count-rules')!.textContent).toBe('25 of 25');
    expect(q('result-gemma4:31b')!.textContent).toContain('79.6 to 99.9%');
    expect(q('see-every-line')!.textContent).toBe('See every line');
    // The line sheet, the options and the ruling details wait for the next step.
    for (const id of ['line-sheet', 'line-detail', 'options', 'per-field', 'ruling-details']) expect(q(id)).toBeNull();
  });

  it('opens every line on the deciding line, with the ruling, and keeps the details behind two closed disclosures', async () => {
    const { q, click } = await render();
    await click('see-every-line');
    expect(q('comparison-overview')).toBeNull();
    expect(q('comparison-lede')!.textContent).toBe(
      'Every miss is the same field, the frequency, on the one line that says “at bedtime as needed”. Read that line the other way and a different model comes out ahead.',
    );
    expect(q('bedtime-ruling')!.textContent).toContain('“at bedtime as needed” means no fixed schedule, as needed, at most once a day.');
    expect(q('ruling-details')!.textContent).toContain('The schedule and the as-needed maximum are separate fields.');
    expect(q('decision-panel')!.textContent).toBe('Ahead on these lines: gpt-oss:20b under the ruling, and qwen3.8:27b under the gold as first written.');
    expect((q('reading-ruling') as HTMLInputElement).checked).toBe(true);
    expect(q('sheet-row-s25')!.getAttribute('data-selected')).toBe('true');
    expect(q('line-detail-sig')!.textContent).toBe('Melatonin 3 mg tab - take 1 tablet by mouth at bedtime as needed for sleep');
    expect(q('detail-row-frequency')!.textContent).toContain('does not match');
    expect((q('per-field') as HTMLDetailsElement).open).toBe(false);
    expect((q('options') as HTMLDetailsElement).open).toBe(false);
    expect(q('options-toggle')!.textContent).toContain('25 development lines, the ruling, run 1');
    expect(q('field-gemma4:31b-frequency')!.textContent).toBe('24');
    expect(q('field-gemma4:31b-frequency')!.className).toContain('text-alert');
    expect(q('field-gpt-oss:20b-frequency')!.className).not.toContain('text-alert');
    await click('back-to-overview');
    expect(q('see-every-line')).not.toBeNull();
  });

  it('carries the reading and the set back to the overview, and the words stay true', async () => {
    const { q, click } = await render();
    await click('see-every-line');
    await click('reading-first-gold');
    expect(q('bedtime-ruling')!.textContent).toContain('Scored with the gold as first written');
    expect(q('decision-panel')!.textContent).toBe('Ahead on these lines: qwen3.8:27b under the gold as first written, and gpt-oss:20b under the ruling.');
    await click('back-to-overview');
    expect(q('count-gpt-oss:20b')!.textContent).toBe('24 of 25');
    expect(q('count-qwen3.8:27b')!.textContent).toBe('25 of 25');
    expect(q('comparison-headline')!.textContent).toBe('A simple rules parser does as well as every model, so these lines can’t pick one.');
    await click('see-every-line');
    await click('set-templates12');
    expect(q('sheet-row-h02')!.getAttribute('data-selected')).toBe('true');
    expect(q('run-1')).toBeNull();
    await click('back-to-overview');
    expect(q('count-gpt-oss:20b')!.textContent).toBe('10 of 12');
    expect(q('comparison-lede')!.textContent).toBe(
      'All four read 10 to 12 of the 12 template lines fully right, and every miss is the frequency on the two lines that say “at bedtime as needed”.',
    );
  });

  it('labels every verdict cell for a screen reader', async () => {
    const { q, click } = await render();
    await click('see-every-line');
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
