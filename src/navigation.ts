import type { TabType } from './types/workshop';

/**
 * Three sections instead of eight tabs. Each view keeps its own test id, so every screen the
 * workshop had is still one click inside its section.
 */
export type SectionId = 'results' | 'try' | 'reference';

export interface ViewInfo {
  testId: string;
  label: string;
}

export const VIEWS: Record<TabType, ViewInfo> = {
  compare: { testId: 'tab-run-comparison', label: 'Run comparison' },
  benchmark: { testId: 'tab-benchmark-studio', label: 'Label audit' },
  wizard: { testId: 'tab-task-wizard', label: 'Task wizard' },
  studio: { testId: 'tab-use-case-studio', label: 'Use cases' },
  builder: { testId: 'tab-flow-builder', label: 'Flow builder' },
  catalog: { testId: 'tab-model-catalog', label: 'Models' },
  hardware: { testId: 'tab-hardware-advisor', label: 'Hardware' },
  shortcuts: { testId: 'tab-shortcuts-studio', label: 'Shortcuts' },
};

export interface SectionInfo {
  id: SectionId;
  testId: string;
  label: string;
  /** What the section holds, for the section's sub-navigation label. */
  summary: string;
  views: TabType[];
}

export const SECTIONS: SectionInfo[] = [
  { id: 'results', testId: 'section-results', label: 'Results', summary: 'What the saved runs show', views: ['compare', 'benchmark'] },
  { id: 'try', testId: 'section-try', label: 'Try it', summary: 'Run small models yourself', views: ['wizard', 'studio', 'builder'] },
  { id: 'reference', testId: 'section-reference', label: 'Reference', summary: 'Guides for a Mac', views: ['catalog', 'hardware', 'shortcuts'] },
];

export function sectionOf(view: TabType): SectionInfo {
  return SECTIONS.find((s) => s.views.includes(view)) ?? SECTIONS[0];
}
