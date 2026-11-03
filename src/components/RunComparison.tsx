import React, { useMemo, useState } from 'react';
import { Check, ChevronRight, CircleDashed, X } from 'lucide-react';
import { SIG_FIELDS, type SigField } from '../eval/sigScore';
import {
  buildBench, formatPercentInterval, showValue, fieldValue, headline, missNote, DECIDING_LINE, FIELD_LABELS, SET_INFO,
  type BenchColumn, type Reading, type SetId, type Verdict,
} from '../bench/runComparison';

const READING: Record<Reading, { name: string; option: string; hint: string }> = {
  ruling: { name: 'the ruling', option: 'The pharmacist ruling of 3 November 2026', hint: 'No fixed schedule, as needed, at most once a day' },
  'first-gold': { name: 'the gold as first written', option: 'The gold as first written', hint: 'Once a day, at bedtime' },
};

const otherReading = (r: Reading): Reading => (r === 'ruling' ? 'first-gold' : 'ruling');

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
  const [set, setSet] = useState<SetId>('dev25');
  const [reading, setReading] = useState<Reading>('ruling');
  const [run, setRun] = useState(0);
  const [selected, setSelected] = useState<{ line: string; column: string }>({ line: DECIDING_LINE.dev25, column: 'gemma4:31b' });

  const view = useMemo(() => buildBench(set, reading), [set, reading]);
  const other = useMemo(() => buildBench(set, otherReading(reading)), [set, reading]);
  const runIndex = Math.min(run, SET_INFO[set].runs - 1);
  const line = view.lines.find((l) => l.id === selected.line) ?? view.lines[0];
  const chosen = view.columns.find((c) => c.id === selected.column) ?? view.columns[0];
  const at = (c: BenchColumn) => Math.min(runIndex, c.runs.length - 1);
  const verdictOf = (c: BenchColumn, lineId: string) => c.runs[at(c)][lineId];
  const models = view.columns.filter((c) => c.kind === 'model');

  const changeSet = (next: SetId) => {
    setSet(next);
    setSelected((s) => ({ ...s, line: DECIDING_LINE[next] }));
  };

  const stability =
    set === 'dev25'
      ? models.every((c) => c.stable)
        ? 'Each model gave the same answers in run 1 and run 2.'
        : `${models.filter((c) => c.stable === false).map((c) => c.label).join(' and ')} changed answers between runs.`
      : 'One run per model on these lines.';

  return (
    <section data-testid="run-comparison" aria-labelledby="run-comparison-title">
      {/* The finding first, then the one table that backs it */}
      <div className="grid gap-x-16 gap-y-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,640px)]">
        <div data-testid="comparison-intro" className="min-w-0 max-w-[46rem]">
          <h2 id="run-comparison-title" data-testid="comparison-headline" className="text-balance text-[24px] font-semibold leading-[1.25] tracking-[-0.01em] text-ink sm:text-[28px] xl:text-[30px]">
            {headline(view, runIndex)}
          </h2>
          <p data-testid="comparison-lede" className="mt-4 text-[17px] leading-relaxed text-ink-2">
            {missNote(view, other, runIndex)}
          </p>
          <div className="mt-6 space-y-2">
            <p data-testid="no-model-chosen" className="flex items-start gap-2.5 text-[15px] leading-relaxed text-ink">
              <CircleDashed className="mt-[3px] h-[18px] w-[18px] shrink-0 text-ink-3" aria-hidden="true" />
              <span>
                <span className="font-semibold">No model chosen yet</span>, and none will be until the new blind test set runs.
              </span>
            </p>
            <p data-testid="bedtime-ruling" className="pl-7 text-[15px] leading-relaxed text-ink-2">
              {reading === 'ruling'
                ? 'Scored with the pharmacist ruling of 3 November 2026: “at bedtime as needed” means no fixed schedule, as needed, at most once a day.'
                : 'Scored with the gold as first written, which read “at bedtime as needed” as once a day. The ruling of 3 November 2026 reads it as no fixed schedule.'}{' '}
              <a href="#ruling-details" className="text-accent underline decoration-1 underline-offset-[3px] hover:decoration-2">
                About the ruling
              </a>
            </p>
          </div>
        </div>

        <div data-testid="comparison-results" className="min-w-0 max-w-[640px] xl:pt-1">
          <table data-testid="results-table" className="w-full text-left">
            <caption className="sr-only">Lines with all six fields right, by model, on the {SET_INFO[set].label}</caption>
            <thead>
              <tr className="border-b border-rule text-[13px] text-ink-3">
                <th scope="col" className="py-2 pr-4 font-medium">Model</th>
                <th scope="col" className="py-2 pr-4 font-medium">All six fields right</th>
                <th scope="col" className="py-2 font-medium">95% interval</th>
              </tr>
            </thead>
            <tbody>
              {view.columns.map((c) => (
                <tr key={c.id} data-testid={`result-${c.id}`} className="border-b border-rule">
                  <th scope="row" className="py-3 pr-4 text-[15px] font-medium text-ink">
                    {c.kind === 'model' ? c.label : <>Rules parser <span className="block text-[13px] font-normal text-ink-3 sm:ml-1 sm:inline">no model</span></>}
                  </th>
                  <td className="whitespace-nowrap py-3 pr-4 text-[15px] text-ink">
                    <span data-testid={`count-${c.id}`}>{c.allCorrect[at(c)]} of {view.n}</span>
                  </td>
                  <td className="whitespace-nowrap py-3 text-[15px] text-ink-2">{formatPercentInterval(c.intervals[at(c)])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p data-testid="decision-panel" className="mt-3 text-[14px] leading-relaxed text-ink-3">
            Ahead on these lines: <span className="text-ink-2">{view.decision.pick ?? 'none'}</span> under {READING[reading].name}, and{' '}
            <span className="text-ink-2">{other.decision.pick ?? 'none'}</span> under {READING[otherReading(reading)].name}.
          </p>

          <div className="mt-6 divide-y divide-rule border-y border-rule">
            <Disclosure testId="per-field" title="Per field">
              <table data-testid="per-field-table" className="w-full max-w-[520px] text-left">
                <caption className="sr-only">Lines with each field right, by model</caption>
                <thead>
                  <tr className="border-b border-rule text-[13px] text-ink-3">
                    <th scope="col" className="py-2 pr-3 font-medium">Field</th>
                    {view.columns.map((c) => (
                      <th key={c.id} scope="col" className="px-2 py-2 text-right font-medium">{c.short}</th>
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
      </div>

      {/* Every line, with the selected one beside it on wide screens and above it on phones */}
      <div className="mt-16 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <aside aria-label="Selected line" className="min-w-0 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:self-start">
          <div data-testid="line-detail" className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-[18px] font-semibold text-ink">Line {line.id}</h3>
              <span className="text-[13px] text-ink-3">{set === 'dev25' ? `Run ${runIndex + 1}` : 'One run'}</span>
            </div>
            <p data-testid="line-detail-sig" className="sig rounded-lg border border-rule-strong bg-panel px-4 py-3 text-[16px] leading-relaxed text-ink">
              {line.input}
            </p>
            <div role="group" aria-label="Answer to compare with the gold" className="flex flex-wrap gap-x-1 border-b border-rule">
              {view.columns.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`detail-column-${c.id}`}
                  aria-pressed={chosen.id === c.id}
                  onClick={() => setSelected((s) => ({ ...s, column: c.id }))}
                  className={`-mb-px min-h-[44px] border-b-2 px-3 text-[15px] font-medium transition-colors ${
                    chosen.id === c.id ? 'border-accent-fill text-ink' : 'border-transparent text-ink-3 hover:text-ink'
                  }`}
                >
                  {c.short}
                </button>
              ))}
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
            <h3 className="text-[18px] font-semibold text-ink">Line by line</h3>
            <p className="text-[14px] text-ink-3">Select a mark to see that answer beside the gold.</p>
          </div>
          <div role="table" aria-label={`Each line, ${SET_INFO[set].label}`} data-testid="line-sheet" className="min-w-0">
            <div role="rowgroup" className="hidden md:block">
              <div role="row" className="grid grid-cols-[minmax(0,1fr)_repeat(4,80px)] border-b border-rule text-[13px] text-ink-3">
                <div role="columnheader" className="py-2 pl-3 font-medium">Line, as written</div>
                {view.columns.map((c) => (
                  <div role="columnheader" key={c.id} className="py-2 text-center font-medium">{c.short}</div>
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
                    className={`grid grid-cols-4 gap-y-1 border-b border-rule px-3 py-3 md:grid-cols-[minmax(0,1fr)_repeat(4,80px)] md:items-center md:px-0 md:py-1 ${
                      isSelected ? 'bg-selected shadow-[inset_2px_0_0_rgb(var(--accent-text))]' : ''
                    }`}
                  >
                    <div role="cell" className="col-span-4 min-w-0 md:col-span-1 md:py-2 md:pl-3 md:pr-4">
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
                            className={`relative flex min-h-[48px] w-full min-w-[44px] max-w-[80px] flex-col items-center justify-center gap-0.5 rounded-md px-1 pb-2 pt-1 transition-colors hover:bg-slate-850 ${
                              active ? 'after:absolute after:bottom-1 after:left-1/2 after:h-0.5 after:w-6 after:-translate-x-1/2 after:rounded-full after:bg-accent-fill' : ''
                            }`}
                          >
                            <span className="text-[12px] text-ink-3 md:hidden">{c.short}</span>
                            <Mark v={v} />
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
        <h3 className="text-[18px] font-semibold text-ink">About these numbers</h3>
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
    </section>
  );
};
