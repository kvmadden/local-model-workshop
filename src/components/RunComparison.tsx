import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleDashed, X } from 'lucide-react';
import { SIG_FIELDS, type SigField } from '../eval/sigScore';
import {
  buildBench, columnHue, showValue, fieldValue, missNote, shortHeadline, whyNote, DECIDING_LINE, FIELD_LABELS, SET_INFO,
  type BenchColumn, type Reading, type SetId, type Verdict,
} from '../bench/runComparison';
import { ResultsChart } from './ResultsChart';

const READING: Record<Reading, { name: string; option: string; hint: string; caption: string }> = {
  ruling: {
    name: 'the ruling',
    option: 'The pharmacist ruling of 3 November 2026',
    hint: 'No fixed schedule, as needed, at most once a day',
    caption: 'the pharmacist ruling of 3 November 2026',
  },
  'first-gold': {
    name: 'the gold as first written',
    option: 'The gold as first written',
    hint: 'Once a day, at bedtime',
    caption: 'the gold as first written',
  },
};

const UNIT: Record<SetId, string> = { dev25: 'development lines', templates12: 'template lines' };

const otherReading = (r: Reading): Reading => (r === 'ruling' ? 'first-gold' : 'ruling');

/** A small square in the column's hue, beside its name wherever the name appears. */
const Swatch = ({ id }: { id: string }) => (
  <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: columnHue(id) }} />
);

/** A set of radio buttons. The label is the target, so each choice is at least 44 px tall. */
function Choice<T extends string>({ legend, name, value, options, onChange, testIdPrefix }: {
  legend: string;
  name: string;
  value: T;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange: (v: T) => void;
  testIdPrefix: string;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[14px] font-semibold text-ink">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            data-testid={`${testIdPrefix}-${o.value}`}
            className="mt-[3px] h-4 w-4 shrink-0 accent-indigo-600"
          />
          <span className="min-w-0">
            <span className="block text-[15px] leading-snug text-ink">{o.label}</span>
            {o.hint && <span className="block text-[13px] leading-snug text-ink-3">{o.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** A quiet disclosure: a chevron, a title and, on the right, what it currently holds. */
function Disclosure({ testId, title, aside, children }: { testId: string; title: string; aside?: string; children: React.ReactNode }) {
  return (
    <details data-testid={testId} className="group">
      <summary data-testid={`${testId}-toggle`} className="flex min-h-[48px] flex-wrap items-center gap-x-2 py-2 text-[15px] font-medium text-ink hover:text-accent">
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-open:rotate-90" aria-hidden="true" />
        <span>{title}</span>
        {aside && <span className="basis-full pl-6 text-[13px] font-normal text-ink-3 sm:ml-auto sm:basis-auto sm:pl-0">{aside}</span>}
      </summary>
      <div className="pb-6 pl-6 pt-1">{children}</div>
    </details>
  );
}

/** The mark in one cell of the line sheet: a quiet check when all six fields are right, the missed field in red otherwise. */
function Mark({ v }: { v: Verdict }) {
  if (v.allCorrect) return <Check className="h-[18px] w-[18px] text-ink-3" strokeWidth={2} aria-hidden="true" />;
  return (
    <span data-miss className="flex flex-col items-center text-[13px] font-semibold leading-tight text-alert" aria-hidden="true">
      {v.missed.map((f) => (
        <span key={f}>{FIELD_LABELS[f].long}</span>
      ))}
    </span>
  );
}

const verdictText = (v: Verdict) =>
  v.allCorrect ? 'all six fields right' : `${v.missed.map((f) => FIELD_LABELS[f].long.toLowerCase()).join(' and ')} wrong`;

export const RunComparison: React.FC = () => {
  const [step, setStep] = useState<'overview' | 'lines'>('overview');
  const [set, setSet] = useState<SetId>('dev25');
  const [reading, setReading] = useState<Reading>('ruling');
  const [run, setRun] = useState(0);
  const [selected, setSelected] = useState<{ line: string; column: string }>({ line: DECIDING_LINE.dev25, column: 'gemma4:31b' });
  const linesTitle = useRef<HTMLHeadingElement>(null);
  const overviewTitle = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const view = useMemo(() => buildBench(set, reading), [set, reading]);
  const other = useMemo(() => buildBench(set, otherReading(reading)), [set, reading]);
  const runIndex = Math.min(run, SET_INFO[set].runs - 1);
  const line = view.lines.find((l) => l.id === selected.line) ?? view.lines[0];
  const chosen = view.columns.find((c) => c.id === selected.column) ?? view.columns[0];
  const at = (c: BenchColumn) => Math.min(runIndex, c.runs.length - 1);
  const verdictOf = (c: BenchColumn, lineId: string) => c.runs[at(c)][lineId];
  const models = view.columns.filter((c) => c.kind === 'model');

  // Each step opens at its top, with focus on its title, so keyboard and screen reader users land in the right place.
  useEffect(() => {
    if (!moved.current) return;
    (step === 'lines' ? linesTitle : overviewTitle).current?.focus({ preventScroll: true });
    document.scrollingElement?.scrollTo?.({ top: 0 });
  }, [step]);
  const go = (next: 'overview' | 'lines') => {
    moved.current = true;
    setStep(next);
  };

  const changeSet = (next: SetId) => {
    setSet(next);
    setSelected((s) => ({ ...s, line: DECIDING_LINE[next] }));
  };

  const caption = `${SET_INFO[set].label}, ${SET_INFO[set].runs > 1 ? `run ${runIndex + 1}` : 'one run'}, scored with ${READING[reading].caption}. Development data.`;
  const stability =
    set === 'dev25'
      ? models.every((c) => c.stable)
        ? 'Each model gave the same answers in run 1 and run 2.'
        : `${models.filter((c) => c.stable === false).map((c) => c.label).join(' and ')} changed answers between runs.`
      : 'One run per model on these lines.';

  if (step === 'overview') {
    return (
      <section data-testid="run-comparison" aria-labelledby="run-comparison-title">
        {/* The finding, the one picture that backs it, and one next step. Nothing else. */}
        <div
          data-testid="comparison-overview"
          className="grid gap-x-16 gap-y-8 lg:min-h-[calc(100vh-17rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[1fr_1fr] xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] 2xl:gap-x-24"
        >
          <div data-testid="comparison-intro" className="min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
            <h2
              ref={overviewTitle}
              tabIndex={-1}
              id="run-comparison-title"
              data-testid="comparison-headline"
              className="font-display text-balance text-[34px] font-semibold leading-[1.06] text-ink focus:outline-none sm:text-[42px] xl:text-[52px] 2xl:text-[60px]"
            >
              {shortHeadline(view, runIndex)}
            </h2>
            <p data-testid="comparison-lede" className="mt-6 max-w-[40rem] text-[18px] leading-relaxed text-ink-2 xl:text-[19px]">
              {whyNote(view, runIndex)}
            </p>
            <p data-testid="no-model-chosen" className="mt-6 flex items-start gap-2.5 text-[16px] leading-relaxed text-ink">
              <CircleDashed className="mt-[3px] h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
              <span>
                <span className="font-semibold">No model chosen yet</span>, and none will be until the new blind test set runs.
              </span>
            </p>
          </div>

          <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
            <ResultsChart view={view} run={runIndex} unit={UNIT[set]} caption={caption} />
          </div>

          <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
            <button
              type="button"
              data-testid="see-every-line"
              onClick={() => go('lines')}
              className="inline-flex min-h-[52px] items-center gap-2.5 rounded-xl bg-accent-fill px-6 text-[17px] font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              See every line
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="run-comparison" aria-labelledby="run-comparison-title">
      <div data-testid="comparison-lines">
        <button
          type="button"
          data-testid="back-to-overview"
          onClick={() => go('overview')}
          className="-ml-1 inline-flex min-h-[44px] items-center gap-2 rounded-lg px-1 text-[15px] font-medium text-ink-2 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Overview
        </button>

        <div className="mt-3 grid gap-x-16 gap-y-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)] xl:items-end">
          <div className="min-w-0">
            <h2
              ref={linesTitle}
              tabIndex={-1}
              id="run-comparison-title"
              className="font-display text-[34px] font-semibold leading-tight text-ink focus:outline-none sm:text-[40px]"
            >
              Every line
            </h2>
            <p data-testid="comparison-lede" className="mt-3 max-w-[44rem] text-[17px] leading-relaxed text-ink-2">
              {missNote(view, other, runIndex)}
            </p>
            <p data-testid="decision-panel" className="mt-2 max-w-[44rem] text-[15px] leading-relaxed text-ink-3">
              Ahead on these lines: <span className="text-ink-2">{view.decision.pick ?? 'none'}</span> under {READING[reading].name}, and{' '}
              <span className="text-ink-2">{other.decision.pick ?? 'none'}</span> under {READING[otherReading(reading)].name}.
            </p>
            <p data-testid="bedtime-ruling" className="mt-2 max-w-[44rem] text-[15px] leading-relaxed text-ink-2">
              {reading === 'ruling'
                ? 'Scored with the pharmacist ruling of 3 November 2026: “at bedtime as needed” means no fixed schedule, as needed, at most once a day.'
                : 'Scored with the gold as first written, which read “at bedtime as needed” as once a day. The ruling of 3 November 2026 reads it as no fixed schedule.'}{' '}
              <a href="#ruling-details" className="text-ink underline decoration-accent decoration-2 underline-offset-[3px] hover:text-accent">
                About the ruling
              </a>
            </p>
          </div>

          <div className="min-w-0 divide-y divide-rule border-y border-rule">
            <Disclosure testId="per-field" title="Per field">
              <table data-testid="per-field-table" className="w-full max-w-[520px] text-left">
                <caption className="sr-only">Lines with each field right, by model</caption>
                <thead>
                  <tr className="border-b border-rule text-[13px] text-ink-3">
                    <th scope="col" className="py-2 pr-3 font-medium">Field</th>
                    {view.columns.map((c) => (
                      <th key={c.id} scope="col" className="px-2 py-2 text-right font-medium">
                        <span className="inline-flex items-center gap-1.5"><Swatch id={c.id} />{c.short}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SIG_FIELDS.map((f) => (
                    <tr key={f} className="border-b border-rule last:border-0">
                      <th scope="row" className="py-2 pr-3 text-[14px] font-normal text-ink-2">{FIELD_LABELS[f].long}</th>
                      {view.columns.map((c) => {
                        const k = c.perField[at(c)][f];
                        return (
                          <td key={c.id} data-testid={`field-${c.id}-${f}`} data-miss={k === view.n ? undefined : true} className={`px-2 py-2 text-right text-[14px] ${k === view.n ? 'text-ink-2' : 'font-semibold text-alert'}`}>
                            {k}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[14px] leading-relaxed text-ink-3">
                Out of {view.n} lines. {stability} The rules parser is frozen and gives the same answer every time.
              </p>
            </Disclosure>

            <Disclosure
              testId="options"
              title="Options"
              aside={`${SET_INFO[set].label}, ${READING[reading].name}, ${SET_INFO[set].runs > 1 ? `run ${runIndex + 1}` : 'one run'}`}
            >
              <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
                <Choice legend="Lines" name="set" value={set} onChange={changeSet} testIdPrefix="set"
                  options={[
                    { value: 'dev25', label: SET_INFO.dev25.label, hint: SET_INFO.dev25.note },
                    { value: 'templates12', label: SET_INFO.templates12.label, hint: SET_INFO.templates12.note },
                  ]} />
                <Choice legend="Reading of “at bedtime as needed”" name="reading" value={reading} onChange={setReading} testIdPrefix="reading"
                  options={[
                    { value: 'ruling', label: READING.ruling.option, hint: READING.ruling.hint },
                    { value: 'first-gold', label: READING['first-gold'].option, hint: READING['first-gold'].hint },
                  ]} />
                {SET_INFO[set].runs > 1 ? (
                  <Choice legend="Run" name="run" value={String(runIndex)} onChange={(v) => setRun(Number(v))} testIdPrefix="run"
                    options={[{ value: '0', label: 'Run 1' }, { value: '1', label: 'Run 2' }]} />
                ) : (
                  <div>
                    <p className="mb-1 text-[14px] font-semibold text-ink">Run</p>
                    <p className="py-2 text-[15px] text-ink-2">One run per model on these lines.</p>
                  </div>
                )}
              </div>
            </Disclosure>
          </div>
        </div>

        {/* Every line, with the selected one beside it on wide screens and above it on phones */}
        <div className="mt-12 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]">
          <aside aria-label="Selected line" className="min-w-0 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:self-start">
            <div data-testid="line-detail" className="space-y-4 rounded-2xl border border-rule bg-panel p-5">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-display text-[20px] font-semibold text-ink">Line {line.id}</h3>
                <span className="text-[13px] text-ink-3">{set === 'dev25' ? `Run ${runIndex + 1}` : 'One run'}</span>
              </div>
              <p data-testid="line-detail-sig" className="sig rounded-lg border border-rule-strong bg-bench px-4 py-3 text-[16px] leading-relaxed text-ink">
                {line.input}
              </p>
              <div role="group" aria-label="Answer to compare with the gold" className="grid grid-cols-4 border-b border-rule">
                {view.columns.map((c) => {
                  const active = chosen.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      data-testid={`detail-column-${c.id}`}
                      aria-pressed={active}
                      onClick={() => setSelected((s) => ({ ...s, column: c.id }))}
                      className={`-mb-px inline-flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-1 text-[14px] font-medium transition-colors ${
                        active ? 'text-ink' : 'border-transparent text-ink-3 hover:text-ink'
                      }`}
                      style={active ? { borderBottomColor: columnHue(c.id) } : undefined}
                    >
                      <Swatch id={c.id} />
                      {c.short}
                    </button>
                  );
                })}
              </div>
              <table className="w-full text-left">
                <caption className="sr-only">Gold and {chosen.label} answer for line {line.id}</caption>
                <thead>
                  <tr className="text-[13px] text-ink-3">
                    <th scope="col" className="py-2 pr-3 font-medium">Field</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Gold</th>
                    <th scope="col" className="py-2 font-medium">{chosen.short}</th>
                  </tr>
                </thead>
                <tbody>
                  {SIG_FIELDS.map((f: SigField) => {
                    const v = verdictOf(chosen, line.id);
                    const ok = v.fields[f];
                    return (
                      <tr key={f} data-testid={`detail-row-${f}`} className="border-t border-rule align-baseline">
                        <th scope="row" className="py-2.5 pr-3 text-[14px] font-normal text-ink-3">{FIELD_LABELS[f].long}</th>
                        <td className="py-2.5 pr-3 text-[15px] text-ink">{showValue(f, fieldValue(line.gold, f))}</td>
                        <td data-miss={ok ? undefined : true} className={`py-2.5 text-[15px] ${ok ? 'text-ink' : 'font-semibold text-alert'}`}>
                          {showValue(f, fieldValue(v.answer, f))}
                          <span className="sr-only">{ok ? ', matches' : ', does not match'}</span>
                          {!ok && <X className="ml-1.5 inline h-4 w-4 align-[-2px]" strokeWidth={2.5} aria-hidden="true" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </aside>

          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h3 className="font-display text-[20px] font-semibold text-ink">Line by line</h3>
              <p className="text-[14px] text-ink-3">Select a mark to see that answer beside the gold.</p>
            </div>
            <div role="table" aria-label={`Each line, ${SET_INFO[set].label}`} data-testid="line-sheet" className="min-w-0 rounded-2xl border border-rule bg-panel">
              <div role="rowgroup" className="hidden md:block">
                <div role="row" className="grid grid-cols-[minmax(0,1fr)_repeat(4,84px)] border-b border-rule text-[13px] text-ink-3">
                  <div role="columnheader" className="py-3 pl-4 font-medium">Line, as written</div>
                  {view.columns.map((c) => (
                    <div role="columnheader" key={c.id} className="flex items-center justify-center gap-1.5 py-3 font-medium">
                      <Swatch id={c.id} />
                      {c.short}
                    </div>
                  ))}
                </div>
              </div>
              <div role="rowgroup">
                {view.lines.map((l) => {
                  const isSelected = l.id === line.id;
                  return (
                    <div
                      role="row"
                      key={l.id}
                      data-testid={`sheet-row-${l.id}`}
                      data-selected={isSelected}
                      className={`grid grid-cols-4 gap-y-1 border-b border-rule px-3 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_repeat(4,84px)] md:items-center md:px-0 md:py-1 ${
                        isSelected ? 'bg-selected shadow-[inset_3px_0_0_rgb(var(--accent-text))]' : ''
                      }`}
                    >
                      <div role="cell" className="col-span-4 min-w-0 md:col-span-1 md:py-2 md:pl-4 md:pr-4">
                        <div className="flex items-baseline gap-3">
                          <span className="w-8 shrink-0 text-[13px] text-ink-3">{l.id}</span>
                          <span className="sig min-w-0 text-[14px] leading-relaxed text-ink">{l.input}</span>
                        </div>
                      </div>
                      {view.columns.map((c) => {
                        const v = verdictOf(c, l.id);
                        const active = isSelected && chosen.id === c.id;
                        return (
                          <div role="cell" key={c.id} className="flex justify-center">
                            <button
                              type="button"
                              data-testid={`cell-${l.id}-${c.id}`}
                              aria-label={`${l.id}, ${c.label}: ${verdictText(v)}`}
                              aria-pressed={active}
                              onClick={() => setSelected({ line: l.id, column: c.id })}
                              className="relative flex min-h-[48px] w-full min-w-[44px] max-w-[84px] flex-col items-center justify-center gap-0.5 rounded-md px-1 pb-2 pt-1 transition-colors hover:bg-slate-850"
                            >
                              <span className="flex items-center gap-1 text-[12px] text-ink-3 md:hidden">
                                <Swatch id={c.id} />
                                {c.short}
                              </span>
                              <Mark v={v} />
                              {active && (
                                <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full" style={{ backgroundColor: columnHue(c.id) }} />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* The details the one-line note links to */}
        <div id="ruling-details" data-testid="ruling-details" className="mt-16 scroll-mt-6 border-t border-rule pt-10">
          <h3 className="font-display text-[22px] font-semibold text-ink">About these numbers</h3>
          <div className="mt-5 grid gap-x-12 gap-y-8 md:grid-cols-3">
            <div>
              <h4 className="text-[15px] font-semibold text-ink">The ruling</h4>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                On 3 November 2026 Kevin Madden, PharmD, ruled that “at bedtime as needed” means no fixed schedule, as needed, at most once a day. The schedule and the as-needed maximum are separate fields. These six fields have no place for the maximum, so under the ruling the frequency of that line is none. The gold as first written read it as once a day.
              </p>
            </div>
            <div>
              <h4 className="text-[15px] font-semibold text-ink">The lines</h4>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                {SET_INFO.dev25.label}: {SET_INFO.dev25.note.charAt(0).toLowerCase()}{SET_INFO.dev25.note.slice(1)} {SET_INFO.templates12.label}: {SET_INFO.templates12.note.charAt(0).toLowerCase()}{SET_INFO.templates12.note.slice(1)} Both sets are development data, so no number here can choose a model.
              </p>
            </div>
            <div>
              <h4 className="text-[15px] font-semibold text-ink">What is not compared</h4>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                Speed is not compared here. The saved runs were timed on a shared, loaded machine. Each 95% interval is the exact binomial interval for the count of lines with all six fields right.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
