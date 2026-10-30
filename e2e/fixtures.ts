/**
 * fixtures.ts — deterministic engine state for the Playwright suite.
 *
 * The browser suite used to inherit whatever Ollama happened to be running on
 * the machine. That is not a flake, it is a suite that asserts a different
 * thing per developer: `workshop.spec.ts` T3-02 and T3-04 assert the hardcoded DEMO
 * samples ("Confidential Summary", "Direct Answer from Local Context"), but the
 * playgrounds correctly switch to LIVE the moment their requested model
 * resolves against a reachable engine. With Ollama up and a llama/qwen tag
 * installed those two tests failed; with Ollama down they passed. Neither
 * outcome was evidence about the code.
 *
 * The unit layer had already solved this — `workshop.stress.test.tsx` and
 * `playgrounds/TruthfulLiveLabeling.test.tsx` both pin `checkOllamaStatus` to
 * unavailable via `vi.mock`, noting the suite "was green only because no engine
 * existed". This is the browser-layer equivalent: every request the page makes
 * to the engine origin is answered by the test, never by the machine.
 *
 * Three states, selected per file or per describe with
 * `test.use({ engineMode: … })`:
 *
 *   'absent'        nothing listening on 11434 — every request is refused at
 *                   the connection, exactly as a dead port behaves. The
 *                   playgrounds must render honest demo output.
 *   'present'       engine up with every model the four playgrounds ask for.
 *                   The playgrounds must go live and stream OUR tokens.
 *   'model-missing' engine up, but holding only models that resolve to none of
 *                   the requested names. This is the state the machine-
 *                   dependent failure was hiding: reachable engine, wrong
 *                   catalog, and the playground must still refuse to claim
 *                   live.
 *
 * Default is 'absent', so a spec that says nothing gets the hermetic
 * engine-down surface the existing assertions were written against.
 */

import { test as base, expect } from '@playwright/test';

export type EngineMode =
  | 'absent'
  | 'present'
  | 'model-missing'
  | 'near-match-version'
  | 'near-match-size'
  | 'near-match-variant';

export type EngineCall = {
  method: string;
  path: string;
  /** Model tag carried by a generate/chat request body, when there is one. */
  model?: string;
};

type EngineFixtures = {
  engineMode: EngineMode;
  engineCalls: EngineCall[];
};

/** Matches every origin `ollamaService.OLLAMA_API` could be pointed at. */
const ENGINE_ROUTE = /^http:\/\/(?:localhost|127\.0\.0\.1):11434\//;

/**
 * The catalog served under 'present'. Each tag is the exact resolution target
 * of one playground's requested model name, so `resolveOllamaModelTag` returns
 * a real match rather than a family-fallback substitute:
 *
 *   'Whisper (Large-v3)' → whisper:large-v3   (VoiceTranscriptionPlayground)
 *   'Llama 3.2 (3B)'     → llama3.2:3b        (DocSummarizingPlayground)
 *   'Phi-3.5 (3.8B)'     → phi3.5:3.8b        (DictationCleanupPlayground)
 *   'Qwen 2.5 (7B)'      → qwen2.5:7b         (FileChattingPlayground)
 */
export const ENGINE_MODEL_TAGS = {
  transcription: 'whisper:large-v3',
  summarizing: 'llama3.2:3b',
  dictation: 'phi3.5:3.8b',
  fileChat: 'qwen2.5:7b',
} as const;

/**
 * The catalog served under 'model-missing'. `mistral:7b` resolves to null for
 * all four requested names — it survives no direct/normalized match, no family
 * keyword, and no llama/qwen/phi/whisper fallback.
 */
const FOREIGN_MODEL_TAG = 'mistral:7b';

/**
 * Near-matches: same family as a requested model, but NOT that model. Each is
 * a real tag that exists on Ollama, and each fails to be the requested model in
 * a different way — which matters because the workshop says a different
 * sentence about each, and because two of these three were resolving as EXACT
 * until the resolver learned to tell them apart.
 *
 *   version  qwen3.6:latest     for "Qwen 2.5 (7B)"  — the state this machine
 *                                is in, and the original silent substitution
 *   size     llama3.2:1b        for "Llama 3.2 (3B)" — right family, right
 *                                version, a third of the parameters
 *   variant  qwen2.5-coder:7b   for "Qwen 2.5 (7B)"  — a specialised build
 *                                offered as the general model
 */
export const NEAR_MATCH_TAGS = {
  version: 'qwen3.6:latest',
  size: 'llama3.2:1b',
  variant: 'qwen2.5-coder:7b',
} as const;

/**
 * The live control present in every near-match mode. Whisper shares no family
 * with the near-matches, so it must resolve exact and go live no matter which
 * near-match is being refused.
 *
 * Without it, all three near-match tests pass just as well against a resolver
 * that has regressed into matching NOTHING — the opposite failure, equally
 * wrong, and wearing the same green.
 */
const NEAR_MATCH_CONTROL = ENGINE_MODEL_TAGS.transcription;

/** What each mode's `/api/tags` reports. */
const ENGINE_CATALOG: Record<EngineMode, string[]> = {
  absent: [],
  present: Object.values(ENGINE_MODEL_TAGS),
  'model-missing': [FOREIGN_MODEL_TAG],
  'near-match-version': [NEAR_MATCH_TAGS.version, NEAR_MATCH_CONTROL],
  'near-match-size': [NEAR_MATCH_TAGS.size, NEAR_MATCH_CONTROL],
  'near-match-variant': [NEAR_MATCH_TAGS.variant, NEAR_MATCH_CONTROL],
};

/**
 * Which model tags may legitimately appear in an inference request, per mode.
 *
 * An empty list is the strong form: NO request may reach /api/generate or
 * /api/chat at all. A non-empty list is the precise form: a request may go out,
 * but only naming a model this mode granted. That second form is what catches
 * the original bug — a playground streaming from a substitute it was never
 * granted still reaches a served endpoint, so "did any request happen" cannot
 * see it, but "which model did it name" can.
 */
const INFERENCE_ALLOWED: Record<EngineMode, string[]> = {
  absent: [],
  present: Object.values(ENGINE_MODEL_TAGS),
  'model-missing': [],
  // Only the control may run. A near-match tag reaching the wire here is the
  // original bug, and it reaches a served endpoint, so nothing short of naming
  // the model would catch it.
  'near-match-version': [NEAR_MATCH_CONTROL],
  'near-match-size': [NEAR_MATCH_CONTROL],
  'near-match-variant': [NEAR_MATCH_CONTROL],
};

/**
 * Sentinels that exist ONLY here. If either appears on the page, the tokens
 * came from this fixture; if the demo copy appears instead, the playground took
 * its hardcoded path. The two cannot be confused for each other.
 */
export const LIVE_GENERATE_TEXT =
  'FIXTURE-LIVE-GENERATE: tokens streamed by the e2e engine stub, never a hardcoded sample.';
export const LIVE_CHAT_TEXT =
  'FIXTURE-LIVE-CHAT: tokens streamed by the e2e engine stub, never a hardcoded sample.';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const modelEntry = (name: string) => ({
  name,
  model: name,
  size: 4_000_000_000,
  modified_at: '2026-01-01T00:00:00Z',
});

const tagsBody = (mode: EngineMode) => ({
  models: ENGINE_CATALOG[mode].map(modelEntry),
});

/**
 * Ollama streams NDJSON. Chunk the sentinel across several lines so the
 * client's line-splitting reader is genuinely exercised rather than handed one
 * tidy payload.
 */
const ndjson = (lines: object[]) => lines.map((line) => JSON.stringify(line)).join('\n') + '\n';

const generateBody = (model: string) => {
  const [head, ...rest] = LIVE_GENERATE_TEXT.split(': ');
  return ndjson([
    { model, response: `${head}: `, done: false },
    { model, response: rest.join(': '), done: false },
    { model, response: '', done: true, done_reason: 'stop' },
  ]);
};

const chatBody = (model: string) => {
  const [head, ...rest] = LIVE_CHAT_TEXT.split(': ');
  return ndjson([
    { model, message: { role: 'assistant', content: `${head}: ` }, done: false },
    { model, message: { role: 'assistant', content: rest.join(': ') }, done: false },
    { model, message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' },
  ]);
};

export const test = base.extend<EngineFixtures>({
  engineMode: ['absent', { option: true }],

  engineCalls: async ({}, use) => {
    await use([]);
  },

  page: async ({ page, engineMode, engineCalls }, use) => {
    await page.route(ENGINE_ROUTE, async (route) => {
      const request = route.request();
      const method = request.method();
      const path = new URL(request.url()).pathname;

      let model: string | undefined;
      if (method === 'POST') {
        try {
          model = (request.postDataJSON() as { model?: string } | null)?.model;
        } catch {
          model = undefined;
        }
      }
      engineCalls.push({ method, path, model });

      // A dead port refuses the connection; it does not answer a preflight.
      if (engineMode === 'absent') {
        await route.abort('connectionrefused');
        return;
      }

      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS });
        return;
      }

      if (method === 'GET' && path === '/api/tags') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: CORS_HEADERS,
          body: JSON.stringify(tagsBody(engineMode)),
        });
        return;
      }

      if (method === 'POST' && path === '/api/generate') {
        await route.fulfill({
          status: 200,
          contentType: 'application/x-ndjson',
          headers: CORS_HEADERS,
          body: generateBody(model ?? 'unknown'),
        });
        return;
      }

      if (method === 'POST' && path === '/api/chat') {
        await route.fulfill({
          status: 200,
          contentType: 'application/x-ndjson',
          headers: CORS_HEADERS,
          body: chatBody(model ?? 'unknown'),
        });
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'UNEXPECTED_ENGINE_ROUTE' }),
      });
    });

    await use(page);

    // The invariant that makes the whole suite hermetic, in the two forms
    // described on INFERENCE_ALLOWED.
    const allowed = INFERENCE_ALLOWED[engineMode];
    const inferenceCalls = engineCalls.filter(
      (call) => call.path === '/api/generate' || call.path === '/api/chat'
    );

    if (allowed.length === 0) {
      // Method-agnostic on purpose: a CORS preflight for a POST that was then
      // aborted still means the page tried.
      expect(
        inferenceCalls,
        `a playground attempted inference with engineMode='${engineMode}', which grants no model`
      ).toEqual([]);
    } else {
      const ungranted = inferenceCalls.filter(
        (call) => call.method === 'POST' && !(call.model && allowed.includes(call.model))
      );
      expect(
        ungranted,
        `a playground ran inference on a model engineMode='${engineMode}' never granted ` +
          `(granted: ${allowed.join(', ')})`
      ).toEqual([]);
    }
  },
});

export { expect };
