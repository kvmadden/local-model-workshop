import { OllamaModel } from '../types/workshop';

export const OLLAMA_API = 'http://localhost:11434';

export async function checkOllamaStatus(): Promise<{ available: boolean; models: OllamaModel[] }> {
  try {
    const res = await fetch(`${OLLAMA_API}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return { available: false, models: [] };
    const data = await res.json();
    const models: OllamaModel[] = (data.models || []).map((m: any) => ({
      name: m.name || m.model || 'unknown',
      size: m.size || 0,
      modified_at: m.modified_at || '',
    }));
    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}

/** Why an installed tag of the right family still is not the requested model. */
export type OllamaMismatch = 'version' | 'size' | 'variant';

/**
 * Either the requested model itself, or a named relative of it — never a
 * disguised substitute. `mismatch` exists only on the non-exact arm — the
 * type makes "exact with a mismatch" and "non-exact without a reason"
 * unrepresentable — and it must be specific enough for the UI to say
 * something true: telling a user that `qwen2.5-coder:7b` is "a different
 * version" of Qwen 2.5 would be a new small falsehood in the banner whose
 * whole job is to stop one.
 */
export type OllamaModelResolution =
  | { tag: string; exact: true }
  | { tag: string; exact: false; mismatch: OllamaMismatch };

/**
 * The families the workshop catalog knows how to ask for. Kept closed on
 * purpose: an unknown family must resolve to null rather than to whatever
 * happens to share a few letters with it.
 */
const FAMILY_KEYWORDS = ['llama', 'qwen', 'deepseek', 'phi', 'whisper'] as const;

/** The first numeric run in `text`, or null. */
function firstNumber(text: string): string | null {
  const match = /\d+(?:\.\d+)*/.exec(text);
  return match ? match[0] : null;
}

/**
 * The parameter count a name commits to, in billions — 3 for "Llama 3.2 (3B)",
 * 8 for `deepseek-r1:8b-llama-distill`. Null when the name does not say, which
 * is the common `:latest` case and must stay permissive.
 */
function parameterCount(text: string): string | null {
  const match = /(\d+(?:\.\d+)?)\s*b(?![a-z])/.exec(text);
  return match ? match[1] : null;
}

/**
 * Letters left in a name fragment once size tokens are removed. A size token
 * (`-7b`, `3.8b`) is a size STATEMENT, not a specialisation — `qwen2.5-7b` is
 * the general Qwen 2.5 at seven billion parameters, not a different build of
 * it — so it must never count as decoration; sizes are compared through
 * `params` instead.
 */
function letters(fragment: string): string {
  return fragment.replace(/\d+(?:\.\d+)?\s*b(?![a-z])/g, '').replace(/[^a-z]/g, '');
}

/**
 * A tag-part with its quantisation and size tokens removed, leaving only text
 * that could state a VERSION. `q3_K_M` states a quantisation and `3b` states a
 * size; reading either digit as a version made `whisper:q3_K_M` an exact
 * match for a Large-v3 request — version 3, conjured from a quant level.
 */
function versionText(fragment: string): string {
  return fragment
    .replace(/q\d+(?:_[a-z0-9]+)*/g, '')
    .replace(/\d+(?:\.\d+)?\s*b(?![a-z])/g, '');
}

interface ParsedModel {
  family: string;
  /** Version as written after the family word: 3.2, 2.5, 1 for DeepSeek-R1. */
  version: string | null;
  /** Parameter count in billions, when stated. */
  params: string | null;
  /**
   * Letters trailing the version inside the model's own name — `coder` in
   * `qwen2.5-coder`, `vision` in `llama3.2-vision`, `vl` in `qwen2.5vl`. These
   * are different models, not different builds of the same one.
   */
  decoration: string;
}

/**
 * Splits an Ollama tag or a catalog display name into the parts that decide
 * identity.
 *
 * The family word must PREFIX the model's own name — the last path segment,
 * before any `:` — and be followed by a non-letter. Requiring the prefix is
 * what separates a model from its relatives: `codellama`, `phind-codellama`
 * and `dolphin-llama3` all CONTAIN a family word but none of them IS that
 * family, and reporting them as "a different version of Llama" is its own
 * small falsehood. It also makes lineage suffixes free — for
 * `deepseek-r1:8b-llama-distill-q4_K_M` only `deepseek-r1` is consulted, so
 * the trailing `llama` cannot misfile it, and FAMILY_KEYWORDS order stops
 * being load-bearing.
 *
 * The version is read from the model's own name first, then from the tag-part
 * with quant and size tokens stripped — so `whisper:large-v3` finds its 3 but
 * `whisper:q3_K_M` stays unversioned — while `decoration` is read from the
 * model name only, so a `:latest` or a quantisation tag never counts as one.
 */
function parseModel(text: string): ParsedModel | null {
  const lower = text.toLowerCase();
  const colon = lower.indexOf(':');
  const name = colon === -1 ? lower : lower.slice(0, colon);
  const variant = colon === -1 ? '' : lower.slice(colon + 1);

  const segmentStart = name.lastIndexOf('/') + 1;
  const segment = name.slice(segmentStart);

  const family = FAMILY_KEYWORDS.find(
    (candidate) => segment.startsWith(candidate) && !/[a-z]/.test(segment.charAt(candidate.length))
  );
  if (!family) return null;

  // The model's own name states the version when it can (`llama3.2`); when it
  // cannot, the tag-part may (`whisper:large-v3`) — but only after its quant
  // and size tokens are stripped, so `whisper:q3_K_M` and `whisper:3b` read as
  // UNVERSIONED rather than as version 3 of a model whose name states none.
  //
  // Anchoring the search after the family word keeps the parameter count out
  // of it: "Llama 3.2 (3B)" yields 3.2 not 3, "Phi-3.5 (3.8B)" yields 3.5 not
  // 3.8.
  const afterFamily = segment.slice(family.length);
  const version = firstNumber(afterFamily) ?? firstNumber(versionText(variant));

  // Decoration must survive the version NOT being in the name. For
  // `whisper-tiny:q3_K_M` nothing in the name states a version, and an earlier
  // revision that read decoration only relative to the version's position in
  // the name lost `tiny` entirely — reporting whisper-tiny as an exact match
  // for a Large-v3 request, the very defect this module exists to stop. When
  // the version is absent from the name, every remaining word in the name IS
  // the decoration.
  let decoration: string;
  if (version === null) {
    decoration = letters(afterFamily);
  } else {
    const versionAt = afterFamily.indexOf(version);
    decoration =
      versionAt === -1
        ? letters(afterFamily)
        : letters(afterFamily.slice(versionAt + version.length));
  }

  // The tag-part states the size when it has one (`:7b`); otherwise the name
  // itself may (`qwen2.5-3b`). Both are size statements, and ignoring the
  // name-part one would let a 3B build answer a 7B card through a `:latest`
  // tag.
  const params = parameterCount(variant) ?? parameterCount(name);

  return { family, version, params, decoration };
}

/**
 * Resolves a preferred/display model name (e.g. "Llama 3.2 (3B)", "Qwen 2.5
 * (7B)", "DeepSeek-R1 (8B)", "Phi-3.5 (3.8B)") against the installed Ollama
 * tags (e.g. "llama3.2:latest", "llama3.2:3b", "qwen2.5:7b"), and reports
 * whether the result is the requested model or merely a relative of it.
 *
 * This used to match on family alone, in three separate places — a substring
 * containment test, keyword lists carrying bare 'qwen2' / 'phi3' / 'deepseek',
 * and a closing `includes('qwen') && includes('qwen')` fallback. All three
 * ignored the version, so a machine with qwen3.6 installed and no qwen2.5
 * answered a "Qwen 2.5 (7B)" request with `qwen3.6:latest`.
 *
 * That answer travelled up as `matchingTag` — the value every caller reads as
 * "the model it asked for" — so the File Chatting playground, which is built
 * around Qwen 2.5, went live on Qwen 3.6 without ever saying so. The version is
 * not a detail here: it is the difference between running the model the
 * workshop is teaching and running a different one under its name.
 *
 * Four things must agree before a tag is called exact — family, version,
 * stated parameter count, and the build decoration (absent, or identical to
 * the decoration the request itself carries). Matching on family and version
 * alone still answered "Qwen 2.5 (7B)" with `qwen2.5-coder:7b` and "Llama 3.2
 * (3B)" with an 11B `llama3.2-vision`, which is the original defect wearing a
 * different hat.
 *
 * The bias is deliberate and one-directional. A false negative parks the
 * playground in demo and names what IS installed; a false positive runs a
 * model the workshop never mentioned under its name. So anything decorated is
 * demoted rather than guessed at — `hf.co/…/Qwen2.5-7B-Instruct-GGUF` is
 * offered as a substitute by name instead of silently becoming the answer.
 *
 * Known and accepted: decoration BEFORE the version is not detected, because
 * `whisper-large-v3` needs `large-v` to pass — a candidate like `llama-guard3`
 * therefore reads as a plain llama 3 and is caught only by its version. A
 * tag-part modifier (`llama3.2:3b-text-q8_0`) does not demote: the tag names
 * the same model, and chat-vs-base tuning is a build detail this contract
 * does not police. And an unversioned, UNDECORATED tag (`whisper:latest`) is
 * labelled a version difference for want of anything provable about it.
 *
 * Returns null when no model of that family is installed at all.
 */
export function resolveOllamaModel(
  preferredName: string,
  availableModels: OllamaModel[]
): OllamaModelResolution | null {
  if (!preferredName || !availableModels || availableModels.length === 0) {
    return null;
  }

  const target = parseModel(preferredName);
  // With no version to hold it to, "exact" would mean nothing — an unversioned
  // request must not be satisfied by whatever that family happens to have.
  if (!target || target.version === null) return null;

  let nearMatch: { tag: string; mismatch: OllamaMismatch } | null = null;

  for (const model of availableModels) {
    const candidate = parseModel(model.name);
    if (!candidate || candidate.family !== target.family) continue;

    const sameVersion = candidate.version === target.version;
    // An undecorated tag is the general model. A decorated one must carry the
    // SAME decoration the request itself carries — the "Phi-3.5 Mini" card is
    // asking FOR the mini, and describing an installed `phi3.5-mini` to it as
    // a different build would be the banner contradicting its own card.
    const sameBuild =
      candidate.decoration === '' || candidate.decoration === target.decoration;
    // A tag that does not state its size cannot contradict the request —
    // `llama3.2:latest` has to keep matching "Llama 3.2 (3B)".
    const sizeAgrees =
      candidate.params === null || target.params === null || candidate.params === target.params;

    if (sameVersion && sameBuild && sizeAgrees) {
      return { tag: model.name, exact: true };
    }
    // Same family, not the same model. Remember the first so it can be offered
    // by name, and keep looking for the one actually requested.
    //
    // The build difference outranks the version difference in the label: "a
    // different version" invites "close enough", and a coder or vision build
    // is not close no matter its version. This also keeps an unversioned
    // decorated tag (`whisper-medium:latest`) honest — its version is unknown,
    // not different, so its decoration speaks for it.
    if (nearMatch === null) {
      const mismatch: OllamaMismatch = !sameBuild ? 'variant' : !sameVersion ? 'version' : 'size';
      nearMatch = { tag: model.name, mismatch };
    }
  }

  return nearMatch === null
    ? null
    : { tag: nearMatch.tag, exact: false, mismatch: nearMatch.mismatch };
}

/**
 * The installed tag for the requested model, or null.
 *
 * Null when a same-family model of another version is installed — that is a
 * substitute, and callers guard on this being null to stay in demo mode. Use
 * `resolveOllamaModel` when you need to name the near-match instead of
 * discarding it.
 */
export function resolveOllamaModelTag(
  preferredName: string,
  availableModels: OllamaModel[]
): string | null {
  const resolution = resolveOllamaModel(preferredName, availableModels);
  return resolution && resolution.exact ? resolution.tag : null;
}

/**
 * Reads an Ollama NDJSON stream. A line carrying `error` ends the stream with that error instead
 * of being skipped, so a model that fails mid-answer cannot look like a short answer. Lines that
 * do not parse are counted, not logged, so streamed text never lands in the console.
 */
async function readNdjson(
  response: Response,
  pick: (json: Record<string, unknown>) => string | undefined,
  onChunk: (chunk: string) => void
): Promise<void> {
  if (!response.body) {
    throw new Error('Response body is null');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let unparsed = 0;

  const handle = (line: string) => {
    if (!line.trim()) return;
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(line);
    } catch {
      unparsed++;
      return;
    }
    if (typeof json.error === 'string') {
      throw new Error(`Ollama stream error: ${json.error.slice(0, 300)}`);
    }
    const text = pick(json);
    if (text !== undefined) onChunk(text);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep trailing partial line in buffer
    for (const line of lines) handle(line);
  }
  if (buffer.trim()) handle(buffer);
  if (unparsed > 0) console.warn(`Skipped ${unparsed} stream line(s) that were not valid JSON.`);
}

export async function generateStream(
  modelTag: string,
  prompt: string,
  onChunk: (chunk: string) => void,
  options?: { systemPrompt?: string },
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${OLLAMA_API}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelTag,
      prompt,
      system: options?.systemPrompt,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Ollama generate request failed with status ${response.status}`);
  }

  await readNdjson(response, (json) => (typeof json.response === 'string' ? json.response : undefined), onChunk);
}

export async function chatStream(
  modelTag: string,
  messages: Array<{ role: string; content: string }>,
  onChunk: (chunk: string) => void,
  options?: object,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${OLLAMA_API}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...options,
      model: modelTag,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Ollama chat request failed with status ${response.status}`);
  }

  await readNdjson(
    response,
    (json) => {
      const message = json.message as { content?: unknown } | undefined;
      return typeof message?.content === 'string' ? message.content : undefined;
    },
    onChunk
  );
}
