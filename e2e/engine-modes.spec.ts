/**
 * engine-modes.spec.ts — the live/demo switch, asserted in a browser.
 *
 * `playgrounds/TruthfulLiveLabeling.test.tsx` proves the engine-ABSENT half of
 * this invariant at the component level, because that is where the original
 * falsehood lived (a hardcoded sample rendered under "Live Local Ollama
 * Streaming"). Nothing proved the other half: that a reachable engine actually
 * produces live output, that the tokens on screen came from the model the
 * playground named, and that a reachable engine holding the WRONG models is
 * still refused.
 *
 * All three are asserted here against a stubbed engine, so the result does not
 * depend on what is installed on the machine running the suite.
 */

import {
  test,
  expect,
  ENGINE_MODEL_TAGS,
  NEAR_MATCH_TAGS,
  LIVE_GENERATE_TEXT,
  LIVE_CHAT_TEXT,
  type EngineCall,
} from './fixtures';
import type { Page } from '@playwright/test';
// Imported rather than hardcoded: the same map drives the banner, the catalog
// card and the detector row, and there are three mismatch kinds ("a different
// version" / "a different size" / "a specialised build"). A literal here would
// be right for this one case and quietly wrong if the case ever changes.
import { MISMATCH_LABEL } from '../src/utils/modelUtils';

type Playground = {
  name: string;
  tab: string;
  /**
   * The playground's own surface. Live-claim assertions are scoped to it: the
   * surrounding app chrome legitimately says "Available via Ollama" in the
   * model catalog and detector, which is an install affordance, not a claim
   * that a model produced what is on screen.
   */
  container: string;
  /** Model tag this playground resolves to when the engine holds it. */
  liveTag: string;
  /** Copy that only ever comes from the hardcoded demo path. */
  demoCopy: RegExp;
  /** Inference endpoint this playground drives when live. */
  endpoint: '/api/generate' | '/api/chat';
  /** Sentinel the stub streams back on that endpoint. */
  liveText: string;
};

const PLAYGROUNDS: Playground[] = [
  {
    name: 'Voice Transcription',
    tab: 'usecase-tab-transcription',
    container: 'voice-transcription-playground',
    liveTag: ENGINE_MODEL_TAGS.transcription,
    demoCopy: /Local Transcription Result/,
    endpoint: '/api/generate',
    liveText: LIVE_GENERATE_TEXT,
  },
  {
    name: 'Confidential Document Summarizing',
    tab: 'usecase-tab-summarizing',
    container: 'doc-summarizing-playground',
    liveTag: ENGINE_MODEL_TAGS.summarizing,
    demoCopy: /Confidential Summary/,
    endpoint: '/api/generate',
    liveText: LIVE_GENERATE_TEXT,
  },
  {
    name: 'Dictation Cleanup',
    tab: 'usecase-tab-dictation',
    container: 'dictation-cleanup-playground',
    liveTag: ENGINE_MODEL_TAGS.dictation,
    demoCopy: /Polished Dictation Output/,
    endpoint: '/api/generate',
    liveText: LIVE_GENERATE_TEXT,
  },
  {
    name: 'File Chatting',
    tab: 'usecase-tab-file-chat',
    container: 'file-chatting-playground',
    liveTag: ENGINE_MODEL_TAGS.fileChat,
    demoCopy: /Demo answer from the sample document \(no model ran\)/,
    endpoint: '/api/chat',
    liveText: LIVE_CHAT_TEXT,
  },
];

/** Copy that asserts a real model produced what is on screen. */
const LIVE_CLAIM =
  /Live Local Ollama Streaming|Live Local Ollama Engine|Local Ollama on this machine|Live Streaming|Engine: Ollama|via Ollama/i;

const openPlayground = async (page: Page, tab: string) => {
  await page.goto('/');
  await page.waitForSelector('[data-testid="app-container"]');
  await page.click('[data-testid="tab-use-case-studio"]');
  await page.waitForSelector('[data-testid="use-case-studio-container"]');
  await page.click(`[data-testid="${tab}"]`);
  await page.waitForSelector('[data-testid="playground-output-container"]');
};

const run = async (page: Page) => {
  await page.click('[data-testid="run-playground-btn"]');
};

const inferenceCalls = (calls: EngineCall[]) =>
  calls.filter((call) => call.path === '/api/generate' || call.path === '/api/chat');

/* ==========================================================================
   ENGINE ABSENT — nothing listening on 11434
   ========================================================================== */
test.describe('Engine absent: playgrounds render honest demo output', () => {
  test.use({ engineMode: 'absent' });

  for (const pg of PLAYGROUNDS) {
    test(`${pg.name}: demo banner, disabled live toggle, demo output, zero engine calls`, async ({
      page,
      engineCalls,
    }) => {
      await openPlayground(page, pg.tab);

      // The loudest "this is not a real model run" signal must be present...
      await expect(page.locator('[data-testid="demo-preview-banner"]')).toBeVisible();
      // ...and live must not even be offered.
      await expect(page.locator('[data-testid="mode-toggle-live"]')).toBeDisabled();

      await run(page);

      const output = page.locator('[data-testid="playground-output-container"]');
      await expect(output).toContainText(pg.demoCopy);

      // Nothing on the playground surface claims a model produced that text.
      await expect(page.locator(`[data-testid="${pg.container}"]`)).not.toContainText(LIVE_CLAIM);
      await expect(page.locator('[data-testid="demo-preview-banner"]')).toBeVisible();

      // And no inference was attempted. (The fixture teardown asserts this too;
      // stated here so the failure names the playground.)
      expect(inferenceCalls(engineCalls)).toEqual([]);
    });
  }
});

/* ==========================================================================
   ENGINE PRESENT, WRONG CATALOG — reachable, but not the requested model
   ========================================================================== */
test.describe('Engine present without the requested model: still demo', () => {
  test.use({ engineMode: 'model-missing' });

  for (const pg of PLAYGROUNDS) {
    test(`${pg.name}: a reachable engine alone does not grant live`, async ({
      page,
      engineCalls,
    }) => {
      await openPlayground(page, pg.tab);

      // This is the case where `available` is true and only model resolution
      // fails. `isLiveAvailable` must still be false, or the playground would
      // run a substitute model under the name of the one it asked for.
      //
      // The probe assertion below only proves a request was made. That the
      // request SUCCEEDED — i.e. that this block is not silently re-testing the
      // engine-absent path — is proved by mutation instead: with
      // `isLiveAvailable = available` (the requested-model check removed), all
      // four tests here go red, which is only possible when `available` is
      // true.
      expect(
        engineCalls.some((call) => call.path === '/api/tags'),
        'the app never probed the engine, so this test proves nothing'
      ).toBe(true);

      await expect(page.locator('[data-testid="demo-preview-banner"]')).toBeVisible();
      await expect(page.locator('[data-testid="mode-toggle-live"]')).toBeDisabled();

      await run(page);

      await expect(page.locator('[data-testid="playground-output-container"]')).toContainText(
        pg.demoCopy
      );
      await expect(page.locator(`[data-testid="${pg.container}"]`)).not.toContainText(LIVE_CLAIM);
      expect(inferenceCalls(engineCalls)).toEqual([]);
    });
  }
});

/* ==========================================================================
   ENGINE PRESENT, NEAR-MATCH INSTALLED — a relative is not the model
   ========================================================================== */

const byTab = (tab: string) => PLAYGROUNDS.find((pg) => pg.tab === tab)!;

/**
 * The three ways an installed tag can be the same family as the requested model
 * and still not BE it. All three used to resolve as exact: 'version' is the
 * substitution that shipped on this machine, and 'size'/'variant' were found
 * when the matcher was tightened — an 11B vision build and a coder build were
 * both answering for the general model on their catalog cards.
 *
 * They are parametrized rather than written out because the interesting
 * difference between them is one string of on-screen wording, and three
 * hand-written copies is how those three sentences drift apart.
 */
const NEAR_MATCH_CASES = [
  {
    kind: 'version' as const,
    mode: 'near-match-version' as const,
    installed: NEAR_MATCH_TAGS.version,
    requested: 'Qwen 2.5 (7B)',
    playground: byTab('usecase-tab-file-chat'),
  },
  {
    kind: 'size' as const,
    mode: 'near-match-size' as const,
    installed: NEAR_MATCH_TAGS.size,
    requested: 'Llama 3.2 (3B)',
    playground: byTab('usecase-tab-summarizing'),
  },
  {
    kind: 'variant' as const,
    mode: 'near-match-variant' as const,
    installed: NEAR_MATCH_TAGS.variant,
    requested: 'Qwen 2.5 (7B)',
    playground: byTab('usecase-tab-file-chat'),
  },
];

for (const nearMatch of NEAR_MATCH_CASES) {
  test.describe(`Near-match installed (${nearMatch.kind}): named, not used`, () => {
    test.use({ engineMode: nearMatch.mode });

    test(`${nearMatch.playground.name} refuses ${nearMatch.installed} and says why by name`, async ({
      page,
      engineCalls,
    }) => {
      await openPlayground(page, nearMatch.playground.tab);

      await expect(page.locator('[data-testid="mode-toggle-live"]')).toBeDisabled();
      await expect(page.locator('[data-testid="demo-preview-banner"]')).toBeVisible();

      // Refusing is necessary but not sufficient. A refusal the reader cannot
      // see is how they end up pulling a model they already have a relative of
      // — so the note has to name what was wanted, what is installed, and how
      // the two differ.
      const note = page.locator('[data-testid="substitute-note"]');
      await expect(note).toBeVisible();
      await expect(note).toContainText(nearMatch.requested);
      await expect(note).toContainText(nearMatch.installed);
      await expect(note).toContainText(MISMATCH_LABEL[nearMatch.kind]);

      // The engine is UP here, so "(Offline)" would contradict the page header.
      await expect(page.locator('[data-testid="live-unavailable-reason"]')).toHaveText(
        '(Model not installed)'
      );

      await run(page);
      await expect(page.locator('[data-testid="playground-output-container"]')).toContainText(
        nearMatch.playground.demoCopy
      );
      await expect(
        page.locator(`[data-testid="${nearMatch.playground.container}"]`)
      ).not.toContainText(LIVE_CLAIM);

      // The wire, not just the label: the near-match must never be the model
      // an inference request names.
      expect(inferenceCalls(engineCalls).map((call) => call.model)).not.toContain(
        nearMatch.installed
      );
    });

    test('Voice Transcription still goes live in the same fixture (refusing everything is not the fix)', async ({
      page,
      engineCalls,
    }) => {
      await openPlayground(page, 'usecase-tab-transcription');

      await expect(page.locator('[data-testid="mode-toggle-live"]')).toBeEnabled();
      await expect(page.locator('[data-testid="demo-preview-banner"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="substitute-note"]')).toHaveCount(0);

      await run(page);
      await expect(page.locator('[data-testid="playground-output-container"]')).toContainText(
        LIVE_GENERATE_TEXT
      );
      expect(inferenceCalls(engineCalls).map((call) => call.model)).toContain(
        ENGINE_MODEL_TAGS.transcription
      );
    });
  });
}

/* ==========================================================================
   ENGINE PRESENT — reachable, holding every requested model
   ========================================================================== */
test.describe('Engine present: playgrounds stream real engine output', () => {
  test.use({ engineMode: 'present' });

  for (const pg of PLAYGROUNDS) {
    test(`${pg.name}: goes live on ${pg.liveTag} and renders engine tokens`, async ({
      page,
      engineCalls,
    }) => {
      await openPlayground(page, pg.tab);

      // Live is granted only after the probe resolves, so wait on the surface
      // rather than racing it.
      await expect(page.locator('[data-testid="mode-toggle-live"]')).toBeEnabled();
      await expect(page.locator('[data-testid="demo-preview-banner"]')).toHaveCount(0);
      // The resolved tag is shown, not the display name from the catalog.
      await expect(page.locator(`[data-testid="${pg.container}"]`)).toContainText(pg.liveTag);

      await run(page);

      const output = page.locator('[data-testid="playground-output-container"]');
      await expect(output).toContainText(pg.liveText);
      // The hardcoded sample is NOT what rendered.
      await expect(output).not.toContainText(pg.demoCopy);

      // The tokens came off the wire, from the model the playground named.
      const calls = inferenceCalls(engineCalls);
      expect(calls.map((call) => call.path)).toContain(pg.endpoint);
      expect(calls.map((call) => call.model)).toContain(pg.liveTag);
    });
  }

  test('a live run never leaves the demo banner or a null model tag on screen', async ({
    page,
  }) => {
    await openPlayground(page, 'usecase-tab-summarizing');
    await expect(page.locator('[data-testid="mode-toggle-live"]')).toBeEnabled();
    await run(page);
    await expect(page.locator('[data-testid="playground-output-container"]')).toContainText(
      LIVE_GENERATE_TEXT
    );

    await expect(page.locator('[data-testid="demo-preview-banner"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="doc-summarizing-playground"]')).not.toContainText(
      /\(null\)|\(undefined\)/
    );
  });
});
