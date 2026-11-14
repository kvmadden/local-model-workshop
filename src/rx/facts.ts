/**
 * Builds the checked facts the rules layer uses for one product, from public sources only, and
 * caches them in bench/rx-intake/system/facts.json. Node only, network.
 *
 * - Marketed strengths and DEA schedule from RxNorm.
 * - The label maximum daily dose and weekly-only dosing from the FDA label on DailyMed. A model reads
 *   the Dosage and Administration text and must quote it. The fact is kept only when the quote is
 *   found in the label text, so the number always traces to the label.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { claudePrint, jsonFrom } from './claudeCli';
import { clinicalDrugs, deaSchedule, dosageSection, ingredientsOf, quoteFound, splTitles, type LabelSection } from './nlm';
import type { DrugFacts } from './rules';

const MASS: Record<string, number> = { MG: 1, MCG: 0.001, G: 1000 };

const FORM_WORDS: Record<string, string[]> = {
  tablet: ['tablet'], orally_disintegrating_tablet: ['disintegrating'], capsule: ['capsule'], solution: ['solution'], suspension: ['suspension'],
  syrup: ['syrup', 'solution'], cream: ['cream'], ointment: ['ointment'], gel: ['gel'], patch: ['patch', 'transdermal'], suppository: ['suppository'],
  inhaler: ['inhal'], nasal_spray: ['nasal'], injection: ['inject', 'pen', 'syringe', 'cartridge'], pen: ['inject', 'pen'], drops: ['solution', 'suspension'],
};
const SPL_FORM: Record<string, string> = { tablet: 'TABLET', orally_disintegrating_tablet: 'TABLET', capsule: 'CAPSULE', solution: 'SOLUTION', suspension: 'SUSPENSION', injection: 'INJECTION', pen: 'INJECTION', patch: 'PATCH', cream: 'CREAM' };

export const factsKey = (generic: string, release: string | null, form: string | null, token: string | null = null) => `${ingredientsOf(generic).join('/')}|${release ?? '-'}|${form ?? '-'}${token ? `|${token}` : ''}`;

const LABEL_SYSTEM = 'You read FDA drug labels for a pharmacy tool. Reply with one JSON object and nothing else.';

export interface FactsEntry extends DrugFacts {
  key: string;
  sources: Record<string, unknown>;
}

export async function buildFacts(generic: string, release: string | null, form: string | null, releaseToken: string | null = null): Promise<FactsEntry> {
  const ings = ingredientsOf(generic);
  const words = form ? FORM_WORDS[form] ?? [form] : [];
  const drugs = (await clinicalDrugs(generic)).filter((d) => !words.length || words.some((w) => d.form.includes(w)));
  const strengths_mg: Record<string, number[]> = {};
  for (const ing of ings) {
    const vals = drugs.flatMap((d) => d.strengths.filter((s) => s.ingredient.includes(ing) && s.unit in MASS).map((s) => Math.round(s.value * MASS[s.unit] * 1e6) / 1e6));
    strengths_mg[ing] = [...new Set(vals)].sort((a, b) => a - b);
  }
  const sched = await deaSchedule(generic);
  const must: string[] = [];
  const mustNot: string[] = [];
  if (release === 'er') must.push('EXTENDED');
  if (release === 'dr') must.push('DELAYED');
  if (release === 'ir') mustNot.push('EXTENDED', 'DELAYED');
  if (form && SPL_FORM[form]) must.push(SPL_FORM[form]);
  const prefer = releaseToken ? [releaseToken] : [];
  const find = async (skip: number) => {
    let sec = await dosageSection(generic, must, mustNot, prefer, skip);
    // A reader can call a delayed-release or extended-release product immediate release. Fall back to any release form, then any form.
    if (!sec) sec = await dosageSection(generic, must.filter((w) => !['EXTENDED', 'DELAYED'].includes(w)), [], prefer, skip);
    if (!sec && form && SPL_FORM[form]) sec = await dosageSection(generic, [], [], prefer, skip);
    return sec;
  };
  let label: DrugFacts['label'] = null;
  const sources: Record<string, unknown> = { rxnorm_clinical_drugs: drugs.length, rxnorm_schedule_rxcui: sched.rxcui, dailymed_tried: [] as unknown[] };
  // Labels for one product differ by manufacturer. Read up to three until one states a maximum.
  for (let skip = 0; skip < 3; skip++) {
    const sec = await find(skip);
    if (!sec) break;
    const read = await readLabel(generic, release, form, sec);
    (sources.dailymed_tried as unknown[]).push(read.source);
    if (!label || (!label.max_daily && read.label.max_daily)) {
      label = read.label;
      sources.dailymed = read.source;
    }
    if (label.max_daily) break;
  }
  if (!label) sources.dailymed = null;
  const titles = form === 'solution' || form === 'drops' || form === 'suspension' ? await splTitles(generic) : [];
  const eye = titles.filter((t) => /DROPS|OPHTHALMIC/i.test(t) && !/INJECTION/i.test(t));
  const singleUse = eye.filter((t) => /\bPF\b|PRESERVATIVE[- ]FREE|SINGLE[- ]USE|UNIT[- ]DOSE|SINGLE[- ]DOSE/i.test(t));
  const both_packages = singleUse.length > 0 && eye.length > singleUse.length ? { single_use_title: singleUse[0] } : null;
  return { key: factsKey(generic, release, form, releaseToken), strengths_mg, schedule: sched.schedule, label, both_packages, sources };
}

/** Facts for a product, from the cache file or built and added to it. */
export async function factsFor(cacheFile: string, generic: string, release: string | null, form: string | null, releaseToken: string | null = null): Promise<FactsEntry> {
  const cache: Record<string, FactsEntry> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const key = factsKey(generic, release, form, releaseToken);
  if (cache[key]) return cache[key];
  const entry = await buildFacts(generic, release, form, releaseToken);
  const fresh: Record<string, FactsEntry> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  fresh[key] = entry;
  writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(Object.entries(fresh).sort(([a], [b]) => a.localeCompare(b))), null, 1) + '\n');
  return entry;
}

async function readLabel(generic: string, release: string | null, form: string | null, sec: LabelSection): Promise<{ label: NonNullable<DrugFacts['label']>; source: Record<string, unknown> }> {
    const prompt = `Product: ${generic}${release ? ` (${release === 'er' ? 'extended release' : release === 'dr' ? 'delayed release' : 'immediate release'})` : ''}${form ? ` ${form}` : ''}.
Label: ${sec.title}

Dosage and Administration text:
${sec.text.slice(0, 30000)}

Reply {"max_daily": {"value": n, "unit": "mg" | "mcg" | "g" | "units" | "tablets" | "capsules", "ingredient": "which ingredient, for a combination product, else null"} or null, "max_quote": "the exact words from the text that state that maximum", "interval_only": "weekly" | "monthly" | null, "interval_quote": "the exact words that show it", "weekly_doses": [{"value": n, "unit": "mg" | "mcg", "interval": "weekly" | "monthly", "quote": "the exact words"}], "daily_doses": [{"value": n, "unit": "mg" | "mcg"}]}.
- max_daily is the highest maximum total daily dose the text states for adults, for any indication. Leave out limits that apply only to a special population (hepatic or renal impairment, older adults, children, low body weight, or a drug interaction). Null when the text states no general maximum.
- interval_only is "weekly" or "monthly" only when every adult regimen in the text is dosed weekly or monthly, never daily. Otherwise null.
- weekly_doses lists each single dose the text gives once weekly or once monthly, and daily_doses each single dose it gives once or more a day. Empty lists when there are none.
- Quotes must be copied exactly from the text above.`;
    const r = await claudePrint({ system: LABEL_SYSTEM, prompt, timeoutMs: 180_000 });
    const j = jsonFrom(r.text) as Record<string, any> | null;
    const maxOk = !!j?.max_daily && quoteFound(String(j.max_quote ?? ''), sec.text);
    const intOk = !!j?.interval_only && quoteFound(String(j.interval_quote ?? ''), sec.text);
    const mg = (d: { value: number; unit: string }) => Number(d.value) * (String(d.unit).toLowerCase() === 'mcg' ? 0.001 : 1);
    const daily = Array.isArray(j?.daily_doses) ? (j!.daily_doses as Array<{ value: number; unit: string }>).map(mg) : [];
    const weeklyOnly = Array.isArray(j?.weekly_doses)
      ? (j!.weekly_doses as Array<{ value: number; unit: string; interval: string; quote: string }>)
          .filter((w) => quoteFound(String(w.quote ?? ''), sec!.text) && !daily.some((d) => Math.abs(d - mg(w)) < 1e-9))
          .map((w) => ({ mg: mg(w), interval: w.interval === 'monthly' ? ('monthly' as const) : ('weekly' as const) }))
      : [];
    const label: NonNullable<DrugFacts['label']> = {
      max_daily: maxOk ? { value: Number(j!.max_daily.value), unit: String(j!.max_daily.unit), ingredient: j!.max_daily.ingredient ?? null } : null,
      interval_only: intOk ? j!.interval_only : null,
      weekly_only_doses: weeklyOnly,
      mg_mentioned: [...new Set([...sec.productMg, ...[...sec.text.matchAll(/(\d+(?:\.\d+)?)\s*mg\b/gi)].map((m) => Number(m[1]))])].sort((a, b) => a - b),
      quote: maxOk ? String(j!.max_quote) : intOk ? String(j!.interval_quote) : null,
      title: sec.title,
      url: sec.url,
    };
    const source = { setid: sec.setid, url: sec.url, title: sec.title, model_reply: j, max_quote_found: maxOk, interval_quote_found: intOk, error: r.error };
    return { label, source };
}
