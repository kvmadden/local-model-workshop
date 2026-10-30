import { ModelCardData } from '../types/workshop';
import modelsJson from './models.json';
import { getModelVramGB } from '../utils/modelUtils';

// No `as` cast: the annotation alone is what makes tsc reject a catalog entry
// that is missing a field (a cast would silently accept one).
export const MODELS_DATA: ModelCardData[] = modelsJson;
export { getModelVramGB };

