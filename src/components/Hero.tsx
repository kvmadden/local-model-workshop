import React from 'react';

const SPECS: Array<{ testId: string; title: string; detail: string }> = [
  { testId: 'hero-badge-privacy', title: 'Local by Default', detail: 'Mock or localhost Ollama' },
  { testId: 'hero-badge-gpu', title: 'Apple Silicon GPU', detail: 'Metal via Ollama or apps' },
  { testId: 'hero-badge-silicon', title: 'M1–M4 Chips', detail: 'Bandwidth-based estimates' },
  { testId: 'hero-badge-zero-code', title: 'No Code', detail: 'Point-and-click flows' },
];

/** The introduction above the reference tabs: what they are for, and a spec grid instead of badge cards. */
export const Hero: React.FC = () => {
  return (
    <section data-testid="hero-section" className="grid gap-5 border-b-2 border-ink pb-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-end">
      <div className="min-w-0 space-y-2">
        <p className="font-mono text-[12px] text-ink-3">Reference shelf. These tabs are guides, not bench results.</p>
        <h2 data-testid="hero-headline" className="font-display text-4xl font-bold uppercase leading-[0.95] tracking-[0.01em] text-ink sm:text-5xl">
          Small Local Models on Your Mac, Without Writing Code
        </h2>
        <p data-testid="hero-subtitle" className="max-w-3xl text-[17px] leading-snug text-ink-2">
          Find small models that fit your Mac, match everyday tasks to desktop apps, and chain prompt steps against a local Ollama or a built-in mock.
        </p>
      </div>
      <dl data-testid="hero-badges-container" className="grid grid-cols-2 gap-px border border-rule-strong bg-rule-strong">
        {SPECS.map((s) => (
          <div key={s.testId} data-testid={s.testId} className="bg-panel px-3.5 py-3">
            <dt className="font-display text-[16px] font-bold uppercase tracking-[0.03em] text-ink">{s.title}</dt>
            <dd className="mt-0.5 font-mono text-[12px] text-ink-3">{s.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
