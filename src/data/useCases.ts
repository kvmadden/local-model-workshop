import { UseCaseData } from '../types/workshop';
import useCasesJson from './useCases.json';

export const USE_CASES_DATA: Record<string, UseCaseData> = useCasesJson as Record<string, UseCaseData>;
