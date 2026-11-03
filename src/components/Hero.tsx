import React from 'react';

const SPECS: Array<{ testId: string; title: string; detail: string }> = [
  { testId: 'hero-badge-privacy', title: 'Local by default', detail: 'The built-in mock, or Ollama on this Mac' },
  { testId: 'hero-badge-gpu', title: 'Apple Silicon GPU', detail: 'Metal, through Ollama or a desktop app' },
  { testId: 'hero-badge-silicon', title: 'M1 to M4 chips', detail: 'Speed estimated from memory bandwidth' },
  { testId: 'hero-badge-zero-code', title: 'No code', detail: 'Point-and-click flows' },
];

/** The introduction above the reference tabs: what they are for, and four plain facts. */
export const Hero: React.FC = () => {
  return (
    <section data-testid="hero-section" className="space-y-6 border-b border-rule pb-8">
      <div className="max-w-3xl space-y-3">
        <h2 data-testid="hero-headline" className="text-[28px] font-semibold leading-tight tracking-[-0.01em] text-balance text-ink sm:text-[32px]">
          Small local models on your Mac, without writing code
        </h2>
        <p data-testid="hero-subtitle" className="text-[17px] leading-relaxed text-ink-2">
          Find small models that fit your Mac, match everyday tasks to desktop apps, and chain prompt steps against a local Ollama or a built-in mock. These tabs are guides, not test results.
        </p>
      </div>
      <dl data-testid="hero-badges-container" className="grid grid-cols-2 gap-x-8 gap-y-4 lg:grid-cols-4">
        {SPECS.map((s) => (
          <div key={s.testId} data-testid={s.testId} className="min-w-0">
            <dt className="text-[15px] font-semibold text-ink">{s.title}</dt>
            <dd className="mt-0.5 text-[14px] leading-snug text-ink-3">{s.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
