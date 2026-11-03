import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { SIG_FIELDS, type SigField } from '../eval/sigScore';
import {
  buildBench, formatPercentInterval, showValue, fieldValue, DECIDING_LINE, FIELD_LABELS, SET_INFO,
  type BenchColumn, type Reading, type SetId, type Verdict,
} from '../bench/runComparison';

const READING_LABEL: Record<Reading, { button: string; long: string }> = {
  ruling: { button: 'Ruling, 3 Nov', long: 'the ruling of 3 November 2026' },
  'first-gold': { button: 'Gold as first written', long: 'the gold as first written' },
};

/** A two-to-three way switch. Each option is a real button with its pressed state announced. */
function Switch<T extends string>({ label, value, options, onChange, testIdPrefix }: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  testIdPrefix: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5 min-w-0">
      <span className="font-display text-xs font-semibold uppercase tracking-label text-ink-3">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            data-testid={`${testIdPrefix}-${o.value}`}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-[44px] min-w-[44px] px-3 border font-display text-[15px] font-semibold uppercase tracking-[0.04em] transition-colors ${
              value === o.value
                ? 'bg-ink text-bench border-ink'
                : 'bg-panel text-ink border-rule-strong hover:border-ink'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The mark in one verification cell: a blue stamp when all six fields are right, a red sticker per missed field. */
function Mark({ v }: { v: Verdict }) {
  if (v.allCorrect) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center border-2 border-stamp text-stamp" aria-hidden="true">
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className="flex flex-col items-center gap-0.5" aria-hidden="true">
      {v.missed.map((f) => (
        <span key={f} className="bg-alert-fill px-1.5 py-0.5 font-display text-[12px] font-bold uppercase leading-4 tracking-[0.04em] text-white">
          {FIELD_LABELS[f].short}
        </span>
      ))}
    </span>
  );
}

const verdictText = (v: Verdict) =>
  v.allCorrect ? 'all six fields right' : `${v.missed.map((f) => FIELD_LABELS[f].long.toLowerCase()).join(' and ')} wrong`;

/** One column's nameplate: its name, the all-fields count with its exact interval, and the count per field. */
function Plate({ c, run, n }: { c: BenchColumn; run: number; n: number }) {
  const r = Math.min(run, c.runs.length - 1);
  return (
    <div data-testid={`plate-${c.id}`} className="border border-rule-strong bg-panel">
      <div className={`flex items-baseline justify-between gap-2 px-3 py-1.5 ${c.kind === 'model' ? 'bg-ink text-bench' : 'bg-raised text-ink'}`}>
        <span className="font-display text-[15px] font-bold uppercase tracking-[0.04em]">{c.label}</span>
        <span className="font-mono text-[11px]">{c.kind === 'model' ? 'local model' : 'no model'}</span>
      </div>
      <div className="px-3 py-2.5 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-xs font-semibold uppercase tracking-label text-ink-3">All six fields</span>
          <span data-testid={`plate-count-${c.id}`} className={`font-mono text-2xl font-semibold ${c.allCorrect[r] === n ? 'text-ink' : 'text-alert'}`}>
            {c.allCorrect[r]}/{n}
          </span>
        </div>
        <div className="font-mono text-[12px] text-ink-3">95% interval {formatPercentInterval(c.intervals[r])}</div>
        <dl className="grid grid-cols-6 border-y border-rule">
          {SIG_FIELDS.map((f, i) => (
            <div key={f} className={`px-1 py-1 text-center ${i > 0 ? 'border-l border-rule' : ''}`}>
              <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">{FIELD_LABELS[f].short}</dt>
              <dd className={`font-mono text-[13px] ${c.perField[r][f] === n ? 'text-ink' : 'text-alert font-semibold'}`}>{c.perField[r][f]}</dd>
            </div>
          ))}
        </dl>
        <div className="font-mono text-[11px] text-ink-3">
          {c.stable === null ? (c.kind === 'model' ? 'One run, so stability is not tested' : 'Frozen parser, same answer every time') : c.stable ? 'Same answers in both runs' : 'Answers changed between runs'}
        </div>
      </div>
    </div>
  );
}

export const RunComparison: React.FC = () => {
  const [set, setSet] = useState<SetId>('dev25');
  const [reading, setReading] = useState<Reading>('ruling');
  const [run, setRun] = useState(0);
  const [selected, setSelected] = useState<{ line: string; column: string }>({ line: DECIDING_LINE.dev25, column: 'gemma4:31b' });

  const view = useMemo(() => buildBench(set, reading), [set, reading]);
  const other = useMemo(() => buildBench(set, reading === 'ruling' ? 'first-gold' : 'ruling'), [set, reading]);
  const runIndex = Math.min(run, SET_INFO[set].runs - 1);
  const line = view.lines.find((l) => l.id === selected.line) ?? view.lines[0];
  const chosenColumn = view.columns.find((c) => c.id === selected.column) ?? view.columns[0];
  const verdictOf = (c: BenchColumn, lineId: string) => c.runs[Math.min(runIndex, c.runs.length - 1)][lineId];

  const changeSet = (next: SetId) => {
    setSet(next);
    setSelected((s) => ({ ...s, line: DECIDING_LINE[next] }));
  };

  return (
    <section data-testid="run-comparison" aria-labelledby="run-comparison-title" className="space-y-5">
      {/* Title and status */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
        <div className="space-y-1.5 min-w-0 max-w-2xl">
          <p className="font-mono text-[12px] text-ink-3">Medication instructions, scored from the saved replies</p>
          <h2 id="run-comparison-title" className="font-display text-4xl sm:text-5xl font-bold uppercase leading-none tracking-[0.01em] text-ink">
            Run comparison
          </h2>
          <p className="text-[17px] leading-snug text-ink-2">
            Three local models and a rules parser, checked field by field on every line. These lines shaped the answer format and the labels, so every number here is development data.
          </p>
        </div>
        <div data-testid="no-model-chosen" className="border-2 border-ink bg-tape px-4 py-2.5 text-tape-ink">
          <div className="font-display text-2xl font-bold uppercase leading-none tracking-[0.03em]">No model chosen</div>
          <div className="mt-1 font-mono text-[12px]">until the new blind test set runs</div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[340px_minmax(0,1fr)_400px] lg:items-start">
      {/* The rail: the ruling, set like a pharmacy label, the switches and the nameplates */}
      <div data-testid="comparison-rail" className="space-y-4 lg:col-span-2 2xl:col-span-1 2xl:col-start-1 2xl:row-start-1">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end 2xl:grid-cols-1">
        <div data-testid="bedtime-ruling" className="border border-rule-strong bg-label text-label-ink">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dashed border-[#80888f] px-4 py-2">
            <span className="font-display text-[15px] font-bold uppercase tracking-label">Pharmacist ruling, 3 Nov 2026</span>
            <span className="font-mono text-[12px]">Kevin Madden, PharmD</span>
          </div>
          <div className="px-4 py-3 space-y-1.5">
            <p className="font-mono text-[15px] font-semibold uppercase leading-snug">
              At bedtime as needed: no fixed schedule, as needed, at most once a day.
            </p>
            <p className="text-[15px] leading-snug">
              The schedule and the as-needed maximum are separate fields. These six fields have no place for the maximum, so here the ruling shows as frequency none.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          <Switch label="Lines" value={set} onChange={changeSet} testIdPrefix="set"
            options={[{ value: 'dev25', label: SET_INFO.dev25.short }, { value: 'templates12', label: SET_INFO.templates12.short }]} />
          <Switch label="Reading" value={reading} onChange={setReading} testIdPrefix="reading"
            options={[{ value: 'ruling', label: READING_LABEL.ruling.button }, { value: 'first-gold', label: READING_LABEL['first-gold'].button }]} />
          {SET_INFO[set].runs > 1 ? (
            <Switch label="Run" value={String(runIndex)} onChange={(v) => setRun(Number(v))} testIdPrefix="run"
              options={[{ value: '0', label: 'Run 1' }, { value: '1', label: 'Run 2' }]} />
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="font-display text-xs font-semibold uppercase tracking-label text-ink-3">Run</span>
              <span className="flex min-h-[44px] items-center font-mono text-[13px] text-ink-2">One run per model</span>
            </div>
          )}
        </div>
      </div>

      <p className="font-mono text-[12px] text-ink-3">
        {SET_INFO[set].label}. {SET_INFO[set].note} Scored under {READING_LABEL[reading].long}.
      </p>

      {/* Nameplates */}
      <div data-testid="column-plates" className="grid grid-cols-1 min-[430px]:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-1 gap-3">
        {view.columns.map((c) => <Plate key={c.id} c={c} run={runIndex} n={view.n} />)}
      </div>
      </div>

        {/* The selected line, first in reading order, placed on the right on wide screens */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-2 2xl:col-start-3 2xl:row-start-1" aria-label="Selected line">
          <div data-testid="line-detail" className="border border-rule-strong bg-panel">
            <div className="flex items-baseline justify-between gap-2 bg-ink px-4 py-2 text-bench">
              <span className="font-display text-[15px] font-bold uppercase tracking-label">Line {line.id}</span>
              <span className="font-mono text-[12px]">{set === 'dev25' ? `run ${runIndex + 1}` : 'one run'}</span>
            </div>
            <div className="space-y-3 p-4">
              <p data-testid="line-detail-sig" className="border border-rule bg-label px-3 py-2 font-mono text-[14px] leading-snug text-label-ink">{line.input}</p>
              <div role="group" aria-label="Answer to compare with the gold" className="flex flex-wrap gap-1">
                {view.columns.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    data-testid={`detail-column-${c.id}`}
                    aria-pressed={chosenColumn.id === c.id}
                    onClick={() => setSelected((s) => ({ ...s, column: c.id }))}
                    className={`min-h-[44px] px-2.5 border font-display text-[14px] font-semibold uppercase tracking-[0.03em] ${
                      chosenColumn.id === c.id ? 'bg-ink text-bench border-ink' : 'bg-panel text-ink border-rule-strong hover:border-ink'
                    }`}
                  >
                    {c.short}
                  </button>
                ))}
              </div>
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Gold and {chosenColumn.label} answer for line {line.id}</caption>
                <thead>
                  <tr className="border-b border-ink font-display text-[12px] uppercase tracking-label text-ink-3">
                    <th scope="col" className="py-1.5 pr-2 font-semibold">Field</th>
                    <th scope="col" className="py-1.5 pr-2 font-semibold">Gold</th>
                    <th scope="col" className="py-1.5 font-semibold">{chosenColumn.short}</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-[13px]">
                  {SIG_FIELDS.map((f: SigField) => {
                    const v = verdictOf(chosenColumn, line.id);
                    const ok = v.fields[f];
                    return (
                      <tr key={f} data-testid={`detail-row-${f}`} className="border-b border-rule align-top">
                        <th scope="row" className="py-1.5 pr-2 font-sans text-[14px] font-semibold text-ink-2">{FIELD_LABELS[f].long}</th>
                        <td className="py-1.5 pr-2 text-ink">{showValue(f, fieldValue(line.gold, f))}</td>
                        <td className={`py-1.5 ${ok ? 'text-ink' : 'text-alert font-semibold'}`}>
                          {showValue(f, fieldValue(v.answer, f))}
                          <span className="sr-only">{ok ? ', matches' : ', does not match'}</span>
                          {!ok && <span aria-hidden="true" className="ml-2 inline-block bg-alert-fill px-1.5 py-0.5 align-middle font-display text-[11px] font-bold uppercase leading-none tracking-[0.04em] text-white">miss</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div data-testid="decision-panel" className="border-2 border-ink bg-panel p-4 space-y-2">
            <div className="font-display text-xs font-semibold uppercase tracking-label text-ink-3">Under {READING_LABEL[reading].long}</div>
            <p className="text-[16px] leading-snug text-ink">
              Leads on development data: <span className="font-mono font-semibold">{view.decision.pick ?? 'none'}</span>. {view.decision.reason}
            </p>
            <p className="text-[15px] leading-snug text-ink-2">
              Under {READING_LABEL[reading === 'ruling' ? 'first-gold' : 'ruling'].long}: <span className="font-mono">{other.decision.pick ?? 'none'}</span>.
            </p>
            <p className="border-t border-rule pt-2 text-[15px] font-semibold leading-snug text-ink">
              No model is chosen. The blind test set decides, and it has not been written yet.
            </p>
            <p className="font-mono text-[12px] text-ink-3">Speed is not compared here. The saved runs were timed on a shared, loaded machine.</p>
          </div>
        </aside>

        {/* The verification sheet */}
        <div role="table" aria-label={`Verification sheet, ${SET_INFO[set].label}`} data-testid="verification-sheet" className="min-w-0 border border-rule-strong bg-panel lg:col-start-1 lg:row-start-2 2xl:col-start-2 2xl:row-start-1">
          <div role="rowgroup" className="hidden md:block">
            <div role="row" className="grid grid-cols-[minmax(0,1fr)_repeat(4,76px)] items-end border-b-2 border-ink bg-panel">
              <div role="columnheader" className="px-3 py-2 font-display text-[13px] font-semibold uppercase tracking-label text-ink-3">Line, as written</div>
              {view.columns.map((c) => (
                <div role="columnheader" key={c.id} className="px-1 py-2 text-center font-display text-[13px] font-bold uppercase tracking-[0.03em] text-ink">
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
                  className={`grid grid-cols-4 md:grid-cols-[minmax(0,1fr)_repeat(4,76px)] items-center gap-y-2 border-b border-rule px-3 py-2.5 md:px-0 md:py-0 ${
                    isSelected ? 'bg-stamp-tint outline outline-2 -outline-offset-2 outline-ink' : ''
                  }`}
                >
                  <div role="cell" className="col-span-4 md:col-span-1 md:px-3 md:py-2 min-w-0">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 shrink-0 font-mono text-[12px] font-semibold text-ink-3">{l.id}</span>
                      <span className="min-w-0 border border-rule bg-label px-2 py-1 font-mono text-[13px] leading-snug text-label-ink">{l.input}</span>
                    </div>
                  </div>
                  {view.columns.map((c) => {
                    const v = verdictOf(c, l.id);
                    const active = isSelected && chosenColumn.id === c.id;
                    return (
                      <div role="cell" key={c.id} className="flex justify-center md:py-1">
                        <button
                          type="button"
                          data-testid={`cell-${l.id}-${c.id}`}
                          aria-label={`${l.id}, ${c.label}: ${verdictText(v)}`}
                          aria-pressed={active}
                          onClick={() => setSelected({ line: l.id, column: c.id })}
                          className={`flex min-h-[48px] w-full min-w-[44px] max-w-[72px] flex-col items-center justify-center gap-0.5 border px-1 ${
                            active ? 'border-ink bg-panel' : 'border-transparent hover:border-rule-strong'
                          }`}
                        >
                          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3 md:hidden">{c.short}</span>
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
    </section>
  );
};
