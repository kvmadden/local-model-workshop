import { ModelCardData } from '../types/workshop';
import { OllamaMismatch } from '../services/ollamaService';

/**
 * How an installed model differs from the one that was asked for, in words a
 * non-technical reader can act on — this workshop's audience is explicitly
 * non-technical, so these say what differs rather than naming the mechanism.
 *
 * Defined once because three surfaces show it (the playground banner, the
 * catalog card, the detector row) and a near-match described three ways is how
 * they drift into disagreeing about the same model.
 */
export const MISMATCH_LABEL: Record<OllamaMismatch, string> = {
  version: 'a different version',
  size: 'a different size',
  // Deliberately modest: 'variant' covers coder builds, vision builds,
  // distills and fine-tunes alike, and a bolder sentence ("not the general
  // model") reads false the moment the variant IS someone's general model.
  variant: 'a different build',
};

/**
 * Calculates model VRAM footprint in GB from catalog model data.
 * Parses the `macRamRequired` field for exact VRAM size or provides data-driven fallbacks.
 */
export const getModelVramGB = (model: ModelCardData): number => {
  if (!model || !model.macRamRequired) return 2.2;
  const match = model.macRamRequired.match(/\((\d+(?:\.\d+)?)\s*GB\s*VRAM/i);
  if (match && match[1]) {
    return parseFloat(match[1]);
  }
  if (model.id?.includes('7b')) return 4.7;
  if (model.id?.includes('8b')) return 4.9;
  if (model.id?.includes('whisper')) return 3.1;
  if (model.id?.includes('phi')) return 2.6;
  return 2.2;
};
