/**
 * modelVersionTruthfulness.test.tsx
 *
 * A playground may go live only on the VERSION it asked for.
 *
 * Commit 2373b6c stopped `usePlaygroundState` from handing callers a
 * `models[0]` substitute under the name `matchingTag`. That closed the hole at
 * the hook. It did not close it in the resolver underneath, which ended in a
 * family substring match:
 *
 *     if (pLower.includes('qwen') && mLower.includes('qwen')) return true;
 *
 * So on an inventory of gemma4:26b / qwen3.6:latest / gemma4:12b / llama3.2:3b,
 * `resolveOllamaModelTag('Qwen 2.5 (7B)', …)` returned `qwen3.6:latest`. The
 * File Chatting playground — built around Qwen 2.5 — went LIVE on Qwen 3.6.
 * `matchingTag` was not "the model it asked for", it was "a family-ish match",
 * and every downstream `if (!matchingTag)` guard read it as the former.
 *
 * That is the same class the earlier commit named: the swap was never the
 * problem, the silence was. These tests pin the version, at both layers:
 *
 *   - the RESOLVER must not call a different version an answer;
 *   - the HOOK must keep such a near-match out of `matchingTag` and offer it
 *     through `substituteAvailable`, BY NAME, so the UI can say which model
 *     would actually run.
 *
 * Every assertion is paired with a control on a version that IS installed
 * (llama3.2:3b), so the file cannot pass by refusing everything.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OllamaModel } from '../types/workshop';

/**
 * Copy that asserts a real model produced what is on screen. Kept in sync with
 * TruthfulLiveLabeling.test.tsx; the control test below proves it can fire.
 */
const LIVE_CLAIM =
  /Live Local Ollama Streaming|Live Local Ollama Engine|Live Streaming|Engine: Ollama|via Ollama|Polish Live via Ollama|Run Live Transcribe|Re-run Live Transcription/i;

/**
 * The verified inventory of the machine this defect was found on. Note that
 * qwen3.6 is present and qwen2.5 is NOT — that is the whole point — and that
 * gemma4:26b is models[0], the arbitrary model the old `substituteAvailable`
 * would have offered for a Qwen request.
 */
const { INSTALLED } = vi.hoisted(() => ({
  INSTALLED: [
    { name: 'gemma4:26b', size: 17000000000, modified_at: '2026-08-01' },
    { name: 'qwen3.6:latest', size: 5000000000, modified_at: '2026-08-01' },
    { name: 'gemma4:12b', size: 8000000000, modified_at: '2026-08-01' },
    { name: 'llama3.2:3b', size: 2000000000, modified_at: '2026-08-01' },
  ] as OllamaModel[],
}));

vi.mock('./ollamaService', async () => {
  const actual = await vi.importActual<typeof import('./ollamaService')>('./ollamaService');
  return {
    ...actual,
    checkOllamaStatus: vi.fn(async () => ({ available: true, models: INSTALLED })),
  };
});

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { resolveOllamaModelTag, resolveOllamaModel } from './ollamaService';
import { usePlaygroundState } from '../hooks/usePlaygroundState';
import { FileChattingPlayground } from '../components/playgrounds/FileChattingPlayground';
import { DocSummarizingPlayground } from '../components/playgrounds/DocSummarizingPlayground';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('resolveOllamaModelTag — a different version is not a match', () => {
  it('CONTROL: resolves Llama 3.2 (3B) to the installed llama3.2:3b', () => {
    expect(resolveOllamaModelTag('Llama 3.2 (3B)', INSTALLED)).toBe('llama3.2:3b');
  });

  it('does not answer a Qwen 2.5 request with the installed qwen3.6', () => {
    expect(resolveOllamaModelTag('Qwen 2.5 (7B)', INSTALLED)).toBeNull();
  });

  it('does not answer a Phi-3.5 request with a bare phi3', () => {
    const withPhi3: OllamaModel[] = [{ name: 'phi3:latest', size: 2000000000, modified_at: '' }];
    expect(resolveOllamaModelTag('Phi-3.5 (3.8B)', withPhi3)).toBeNull();
  });

  it('does not answer a Qwen 2.5 request with the previous major, qwen2', () => {
    const withQwen2: OllamaModel[] = [{ name: 'qwen2:7b', size: 4000000000, modified_at: '' }];
    expect(resolveOllamaModelTag('Qwen 2.5 (7B)', withQwen2)).toBeNull();
  });

  it('does not answer a DeepSeek-R1 request with a deepseek-v3', () => {
    const withV3: OllamaModel[] = [{ name: 'deepseek-v3:latest', size: 5000000000, modified_at: '' }];
    expect(resolveOllamaModelTag('DeepSeek-R1 (8B)', withV3)).toBeNull();
  });

  it('CONTROL: still resolves an exact same-version match on a different size tag', () => {
    const withLatest: OllamaModel[] = [{ name: 'qwen2.5:latest', size: 4500000000, modified_at: '' }];
    expect(resolveOllamaModelTag('Qwen 2.5 (7B)', withLatest)).toBe('qwen2.5:latest');
  });
});

describe('resolveOllamaModel — a near-match is reported, never disguised', () => {
  it('reports the version mismatch as a NON-exact same-family candidate', () => {
    const res = resolveOllamaModel('Qwen 2.5 (7B)', INSTALLED);
    expect(res).not.toBeNull();
    expect(res!.tag).toBe('qwen3.6:latest');
    expect(res!.exact).toBe(false);
  });

  it('CONTROL: reports an installed version as exact', () => {
    const res = resolveOllamaModel('Llama 3.2 (3B)', INSTALLED);
    expect(res!.tag).toBe('llama3.2:3b');
    expect(res!.exact).toBe(true);
  });

  it('returns null when the family is absent entirely', () => {
    expect(resolveOllamaModel('Whisper (Large-v3)', INSTALLED)).toBeNull();
  });

  it('does not treat dolphin as the phi family', () => {
    const dolphin: OllamaModel[] = [{ name: 'dolphin3:8b', size: 5000000000, modified_at: '' }];
    expect(resolveOllamaModel('Phi-3.5 (3.8B)', dolphin)).toBeNull();
  });

  it('does not treat codellama as the llama family', () => {
    const codellama: OllamaModel[] = [{ name: 'codellama:7b', size: 4000000000, modified_at: '' }];
    expect(resolveOllamaModel('Llama 3.2 (3B)', codellama)).toBeNull();
  });

  // `deepseek-r1-distill-qwen-7b` is a real tag carrying TWO family words. The
  // leading one is the model's own family; the trailing one is its lineage.
  const distill: OllamaModel[] = [
    { name: 'deepseek-r1-distill-qwen-7b:latest', size: 4700000000, modified_at: '' },
  ];

  it('files a two-family tag under the family it leads with', () => {
    expect(resolveOllamaModel('DeepSeek-R1 (8B)', distill)?.tag).toBe(
      'deepseek-r1-distill-qwen-7b:latest'
    );
  });

  it('does not offer that same tag to a Qwen request', () => {
    expect(resolveOllamaModel('Qwen 2.5 (7B)', distill)).toBeNull();
  });

  /**
   * Family and version agreeing is NOT enough. Each of these is an official
   * library tag whose family and version match the request exactly, and each is
   * a different model — a code model, an 11B vision model, a vision-language
   * model. Calling any of them exact is the original defect wearing a hat.
   */
  const specialised: Array<[string, string]> = [
    ['Qwen 2.5 (7B)', 'qwen2.5-coder:7b'],
    ['Llama 3.2 (3B)', 'llama3.2-vision:11b'],
    ['Qwen 2.5 (7B)', 'qwen2.5vl:7b'],
  ];

  it.each(specialised)('%s is not satisfied by the specialised build %s', (request, tag) => {
    const installed: OllamaModel[] = [{ name: tag, size: 1, modified_at: '' }];
    expect(resolveOllamaModelTag(request, installed)).toBeNull();
    // 'variant', not 'version' — the banner must not call a code model or a
    // vision model "a different version" of the general one.
    expect(resolveOllamaModel(request, installed)).toEqual({
      tag,
      exact: false,
      mismatch: 'variant',
    });
  });

  it('reports a size-only difference as a size difference', () => {
    const oneB: OllamaModel[] = [{ name: 'llama3.2:1b', size: 1, modified_at: '' }];
    expect(resolveOllamaModel('Llama 3.2 (3B)', oneB)).toEqual({
      tag: 'llama3.2:1b',
      exact: false,
      mismatch: 'size',
    });
  });

  it('reports the original qwen3.6 case as a version difference', () => {
    expect(resolveOllamaModel('Qwen 2.5 (7B)', INSTALLED)).toEqual({
      tag: 'qwen3.6:latest',
      exact: false,
      mismatch: 'version',
    });
  });

  it('does not satisfy a 3B request with the 1B build of the same version', () => {
    const oneB: OllamaModel[] = [{ name: 'llama3.2:1b', size: 1300000000, modified_at: '' }];
    expect(resolveOllamaModelTag('Llama 3.2 (3B)', oneB)).toBeNull();
  });

  it('CONTROL: a tag that states no size still matches — :latest must not break', () => {
    const latest: OllamaModel[] = [{ name: 'llama3.2:latest', size: 2000000000, modified_at: '' }];
    expect(resolveOllamaModelTag('Llama 3.2 (3B)', latest)).toBe('llama3.2:latest');
  });

  it('does not mistake phind-codellama for the phi family', () => {
    const phind: OllamaModel[] = [{ name: 'phind-codellama:34b', size: 1, modified_at: '' }];
    expect(resolveOllamaModel('Phi-3.5 (3.8B)', phind)).toBeNull();
  });

  it('does not report a dolphin fine-tune as a different version of Llama', () => {
    const dolphin: OllamaModel[] = [{ name: 'dolphin-llama3:8b', size: 1, modified_at: '' }];
    expect(resolveOllamaModel('Llama 3.2 (3B)', dolphin)).toBeNull();
  });

  it('refuses an unversioned request rather than picking whatever that family has', () => {
    const anyWhisper: OllamaModel[] = [{ name: 'whisper:latest', size: 1, modified_at: '' }];
    expect(resolveOllamaModel('Whisper', anyWhisper)).toBeNull();
  });

  /**
   * The version can come from the TAG-part (`whisper-tiny:q3_K_M` — the 3 is
   * in the quant name), in which case every word in the model's own name is
   * decoration. An earlier revision only read decoration relative to where the
   * version sat in the name, so a name with no digits lost its decoration
   * entirely and whisper-tiny reported exact for a Large-v3 request.
   */
  it('does not satisfy a Whisper Large-v3 request with whisper-tiny under a quant tag', () => {
    const tiny: OllamaModel[] = [{ name: 'whisper-tiny:q3_K_M', size: 1, modified_at: '' }];
    expect(resolveOllamaModelTag('Whisper (Large-v3)', tiny)).toBeNull();
    expect(resolveOllamaModel('Whisper (Large-v3)', tiny)).toEqual({
      tag: 'whisper-tiny:q3_K_M',
      exact: false,
      mismatch: 'variant',
    });
  });

  it('labels an unversioned decorated build as a build difference, not a version difference', () => {
    const medium: OllamaModel[] = [{ name: 'whisper-medium:latest', size: 1, modified_at: '' }];
    expect(resolveOllamaModel('Whisper (Large-v3)', medium)).toEqual({
      tag: 'whisper-medium:latest',
      exact: false,
      mismatch: 'variant',
    });
  });

  it('labels a coder build of another version as a build difference first', () => {
    // Wrong in both ways — but "a different version" invites "close enough",
    // and "a different build" does not, so the build difference wins the label.
    const coder: OllamaModel[] = [{ name: 'qwen3-coder:30b', size: 1, modified_at: '' }];
    expect(resolveOllamaModel('Qwen 2.5 (7B)', coder)).toMatchObject({
      exact: false,
      mismatch: 'variant',
    });
    const dsCoder: OllamaModel[] = [{ name: 'deepseek-coder:1.3b', size: 1, modified_at: '' }];
    expect(resolveOllamaModel('DeepSeek-R1 (8B)', dsCoder)).toMatchObject({
      exact: false,
      mismatch: 'variant',
    });
  });

  /**
   * A size token in the NAME-part is a size statement, not a specialisation:
   * `qwen2.5-7b` IS the general Qwen 2.5 at 7B. And a decorated request must
   * accept its own decoration — the catalog's "Phi-3.5 Mini (3.8B)" card must
   * not describe an installed `phi3.5-mini` as "not the general model".
   */
  it('CONTROL: a size-in-name tag of the right size is the requested model', () => {
    const sized: OllamaModel[] = [{ name: 'qwen2.5-7b:latest', size: 1, modified_at: '' }];
    expect(resolveOllamaModelTag('Qwen 2.5 (7B)', sized)).toBe('qwen2.5-7b:latest');
  });

  it('CONTROL: a Mini request is satisfied by the mini build', () => {
    const mini: OllamaModel[] = [{ name: 'phi3.5-mini:latest', size: 1, modified_at: '' }];
    expect(resolveOllamaModelTag('Phi-3.5 Mini (3.8B)', mini)).toBe('phi3.5-mini:latest');
  });

  it('does not read a quantisation or size token as a version', () => {
    // `q3_K_M` states a quantisation and `3b` states a size; neither states a
    // version. A bare family name under such a tag is UNVERSIONED, and an
    // unversioned tag is never exact — reading the quant digit as "version 3"
    // made whisper:q3_K_M exact for a Large-v3 request.
    const quant: OllamaModel[] = [{ name: 'whisper:q3_K_M', size: 1, modified_at: '' }];
    expect(resolveOllamaModelTag('Whisper (Large-v3)', quant)).toBeNull();
    const sized: OllamaModel[] = [{ name: 'whisper:3b', size: 1, modified_at: '' }];
    expect(resolveOllamaModelTag('Whisper (Large-v3)', sized)).toBeNull();
    const dsQuant: OllamaModel[] = [{ name: 'deepseek:q1_0', size: 1, modified_at: '' }];
    expect(resolveOllamaModelTag('DeepSeek-R1 (8B)', dsQuant)).toBeNull();
  });

  it('does not let a :latest tag hide a size stated in the name', () => {
    // The size lives in the NAME here, not the tag — treating only the
    // tag-part as the size statement would let a 3B answer a 7B card.
    const threeB: OllamaModel[] = [{ name: 'qwen2.5-3b:latest', size: 1, modified_at: '' }];
    expect(resolveOllamaModelTag('Qwen 2.5 (7B)', threeB)).toBeNull();
    expect(resolveOllamaModel('Qwen 2.5 (7B)', threeB)).toMatchObject({
      exact: false,
      mismatch: 'size',
    });
  });

  it('reads a namespaced tag as its own family and version', () => {
    const namespaced: OllamaModel[] = [
      { name: 'ZimaBlueAI/whisper-large-v3:latest', size: 3000000000, modified_at: '' },
    ];
    const res = resolveOllamaModel('Whisper (Large-v3)', namespaced);
    expect(res).toEqual({ tag: 'ZimaBlueAI/whisper-large-v3:latest', exact: true });
  });
});

describe('usePlaygroundState — File Chatting cannot go live on a Qwen it did not ask for', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const Harness: React.FC<{ modelName: string }> = ({ modelName }) => {
    const { mode, isLiveAvailable, matchingTag, substituteAvailable, substituteNote } =
      usePlaygroundState({ modelName });
    return (
      <div>
        <span data-testid="mode">{mode}</span>
        <span data-testid="live">{String(isLiveAvailable)}</span>
        <span data-testid="tag">{String(matchingTag)}</span>
        <span data-testid="substitute">{String(substituteAvailable)}</span>
        <span data-testid="same-family">{String(substituteNote !== null)}</span>
        <span data-testid="note-requested">{String(substituteNote?.requested)}</span>
      </div>
    );
  };

  const read = (id: string) =>
    container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.textContent;

  const render = async (modelName: string) => {
    await act(async () => {
      root.render(<Harness modelName={modelName} />);
    });
  };

  it('stays demo, with a null matchingTag, when only a different Qwen version is installed', async () => {
    await render('Qwen 2.5 (7B)');
    expect(read('tag')).toBe('null');
    expect(read('live')).toBe('false');
    expect(read('mode')).toBe('demo');
  });

  it('names the same-family model that WOULD run, rather than an arbitrary models[0]', async () => {
    await render('Qwen 2.5 (7B)');
    // The old substitute was models[0] — gemma4:26b — which could not honestly
    // be offered as a stand-in for Qwen at all.
    expect(read('substitute')).toBe('qwen3.6:latest');
    expect(read('same-family')).toBe('true');
    expect(read('note-requested')).toBe('Qwen 2.5 (7B)');
  });

  it('CONTROL: goes live on the model it actually asked for', async () => {
    await render('Llama 3.2 (3B)');
    expect(read('tag')).toBe('llama3.2:3b');
    expect(read('live')).toBe('true');
    expect(read('mode')).toBe('live');
    expect(read('substitute')).toBe('null');
  });
});

/**
 * The rendered surface. The hook assertions above prove the data is honest;
 * these prove the user is actually TOLD, which is the half that was missing —
 * the swap was never the problem, the silence was.
 */
describe('SharedPlayground — the near-match is disclosed on screen', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const render = async (element: React.ReactElement) => {
    await act(async () => {
      root.render(element);
    });
  };

  it('File Chatting names both the model it wanted and the one on disk', async () => {
    await render(<FileChattingPlayground />);

    const note = container.querySelector<HTMLElement>('[data-testid="substitute-note"]');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('Qwen 2.5 (7B)');
    expect(note!.textContent).toContain('qwen3.6:latest');
    expect(note!.textContent).toMatch(/different version/i);
  });

  it('File Chatting shows the demo banner and no live claim alongside it', async () => {
    // Proven non-vacuous by the control below: the SAME regex fires on Doc
    // Summarizing, which is genuinely live on llama3.2:3b. An earlier version
    // of this test asserted against "Engine: Ollama" and "Live Local Ollama
    // Streaming" — copy that lives in VoiceTranscription and appears nowhere in
    // this component tree — so it passed with the whole fix reverted.
    await render(<FileChattingPlayground />);

    expect(container.querySelector('[data-testid="substitute-note"]')).not.toBeNull();
    const liveToggle = container.querySelector<HTMLButtonElement>('[data-testid="mode-toggle-live"]');
    expect(liveToggle!.disabled).toBe(true);
    expect(container.textContent).not.toMatch(LIVE_CLAIM);
  });

  it('CONTROL: the same live-claim regex DOES fire on a playground that is live', async () => {
    await render(<DocSummarizingPlayground />);
    expect(container.textContent).toMatch(LIVE_CLAIM);
  });

  it('blames the missing model, not the engine, while Ollama is up', async () => {
    await render(<FileChattingPlayground />);

    // Ollama IS reachable here — saying "(Offline)" next to a header reading
    // "Ollama Active" would contradict the disclosure directly below it.
    const reason = container.querySelector<HTMLElement>('[data-testid="live-unavailable-reason"]');
    expect(reason).not.toBeNull();
    expect(reason!.textContent).toBe('(Model not installed)');
  });

  it('CONTROL: Doc Summarizing gets no note — llama3.2:3b is exactly what it asked for', async () => {
    await render(<DocSummarizingPlayground />);

    expect(container.querySelector('[data-testid="substitute-note"]')).toBeNull();
    const liveToggle = container.querySelector<HTMLButtonElement>('[data-testid="mode-toggle-live"]');
    expect(liveToggle!.disabled).toBe(false);
  });
});
