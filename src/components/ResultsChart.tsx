import { columnHue, formatPercentInterval, type BenchView } from '../bench/runComparison';

const TICKS = [0, 0.25, 0.5, 0.75, 1];

/**
 * The four results as bars with interval whiskers. Each bar is the share of lines with all six
 * fields right, in the column's own hue, growing from zero. The whisker is the exact 95% interval.
 * Every value is also written beside its bar, so nothing depends on color or on hovering.
 */
export function ResultsChart({ view, run, unit, caption }: { view: BenchView; run: number; unit: string; caption: string }) {
  return (
    <figure data-testid="comparison-results" aria-labelledby="results-chart-title" className="min-w-0 rounded-2xl border border-rule bg-panel px-5 py-6 sm:px-8 sm:py-8">
      <h3 id="results-chart-title" className="font-display text-[21px] font-semibold leading-tight text-ink">
        Lines with all six fields right
      </h3>
      <p className="mt-1 text-[14px] leading-snug text-ink-3">
        Out of {view.n} {unit}. The whisker shows the exact 95% interval.
      </p>

      <ul className="mt-7 space-y-6">
        {view.columns.map((c) => {
          const at = Math.min(run, c.allCorrect.length - 1);
          const k = c.allCorrect[at];
          const [lo, hi] = c.intervals[at];
          const hue = columnHue(c.id);
          return (
            <li key={c.id} data-testid={`result-${c.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <span className="flex min-w-0 items-center gap-2 text-[15px] font-medium text-ink">
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: hue }} />
                  {c.kind === 'model' ? c.label : 'Rules parser'}
                  {c.kind !== 'model' && <span className="hidden text-[13px] font-normal text-ink-3 sm:inline">no model</span>}
                </span>
                <span className="whitespace-nowrap text-[15px] text-ink">
                  <span data-testid={`count-${c.id}`}>{k} of {view.n}</span>
                  <span className="text-ink-3"> · {formatPercentInterval([lo, hi])}</span>
                </span>
              </div>
              <div aria-hidden="true" className="relative mt-2.5 h-5">
                {TICKS.map((t) => (
                  <span key={t} className={`absolute inset-y-[-4px] w-px ${t === 0 ? 'bg-rule-strong' : 'bg-rule'}`} style={{ left: `${t * 100}%` }} />
                ))}
                <span className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: `${(k / view.n) * 100}%`, backgroundColor: hue }} />
                <span
                  className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-ink"
                  style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, boxShadow: '0 0 0 1px rgb(var(--panel))' }}
                />
                {[lo, hi].map((x, i) => (
                  <span key={i} className="absolute inset-y-[3px] w-0.5 bg-ink" style={{ left: `calc(${x * 100}% - 1px)`, boxShadow: '0 0 0 1px rgb(var(--panel))' }} />
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <div aria-hidden="true" className="relative mt-3 h-4 text-[12px] leading-4 text-ink-3">
        {TICKS.map((t) => (
          <span
            key={t}
            className="absolute top-0"
            style={{ left: `${t * 100}%`, transform: t === 0 ? 'none' : t === 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}
          >
            {t * 100}%
          </span>
        ))}
      </div>

      <figcaption className="mt-6 border-t border-rule pt-4 text-[14px] leading-snug text-ink-3">{caption}</figcaption>
    </figure>
  );
}
