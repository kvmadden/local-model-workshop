/**
 * Public NLM sources for Rx Intake Check facts. Node only, network, cached on disk.
 *
 * - RxNorm (rxnav.nlm.nih.gov): marketed strengths per ingredient and dose form, and the DEA
 *   schedule of a clinical drug.
 * - DailyMed (dailymed.nlm.nih.gov): the Dosage and Administration section (LOINC 34068-7) of an
 *   FDA label, as plain text.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const CACHE = path.join(os.tmpdir(), 'rx-intake-nlm-cache');
mkdirSync(CACHE, { recursive: true });

async function cached(url: string): Promise<string> {
  const file = path.join(CACHE, createHash('sha256').update(url).digest('hex'));
  if (existsSync(file)) return readFileSync(file, 'utf8');
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      const text = await r.text();
      writeFileSync(file, text);
      return text;
    } catch (err) {
      if (attempt >= 2) throw err;
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
}

/** Ingredient words of a drug name: "hydrocodone/acetaminophen" gives ["hydrocodone", "acetaminophen"]. */
export function ingredientsOf(generic: string): string[] {
  return generic
    .toLowerCase()
    .replace(/\b(xl|xr|er|sr|ir|cr|dr|odt|ophthalmic|otic|oral|topical|hcl|hydrochloride|sodium|potassium|bitartrate|tartrate|succinate|besylate|maleate|mesylate|citrate|sulfate|calcium|magnesium)\b/g, ' ')
    .split(/\/|\band\b|,|\+/)
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

export interface Strength {
  ingredient: string;
  value: number;
  unit: string;
}
export interface ClinicalDrug {
  rxcui: string;
  name: string;
  form: string;
  strengths: Strength[];
}

/** Clinical drugs (RxNorm SCD) whose name contains every ingredient. */
export async function clinicalDrugs(generic: string): Promise<ClinicalDrug[]> {
  const ings = ingredientsOf(generic);
  if (!ings.length) return [];
  const data = JSON.parse(await cached(`https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(ings[0])}`)) as {
    drugGroup?: { conceptGroup?: Array<{ tty?: string; conceptProperties?: Array<{ rxcui: string; name: string }> }> };
  };
  const out: ClinicalDrug[] = [];
  for (const g of data.drugGroup?.conceptGroup ?? []) {
    if (g.tty !== 'SCD') continue;
    for (const c of g.conceptProperties ?? []) {
      const name = c.name.toLowerCase();
      if (!ings.every((i) => name.includes(i))) continue;
      const strengths: Strength[] = [];
      for (const m of c.name.matchAll(/([a-z][a-z0-9 ,-]*?)\s+([\d.]+)\s+(MG\/ML|MCG\/ML|UNT\/ML|MG\/ACTUAT|MCG\/ACTUAT|MCG\/HR|MG\/HR|MG|MCG|UNT|MEQ|G|%)(?![A-Z])/gi)) {
        strengths.push({ ingredient: m[1].trim().toLowerCase(), value: Number(m[2]), unit: m[3].toUpperCase() });
      }
      if (strengths.length > ings.length) continue;
      const form = c.name.replace(/^.*\b(MG|MCG|UNT|MEQ|G|%|ML|ACTUAT|HR)\b\s*/i, '').toLowerCase();
      out.push({ rxcui: c.rxcui, name: c.name, form, strengths });
    }
  }
  return out;
}

/** DEA schedule from RxNorm ("2" to "5"), or null when the drug is not scheduled or unknown. */
export async function deaSchedule(generic: string): Promise<{ schedule: string | null; rxcui: string | null; name: string | null }> {
  const drugs = await clinicalDrugs(generic);
  for (const d of drugs.slice(0, 3)) {
    const props = JSON.parse(await cached(`https://rxnav.nlm.nih.gov/REST/rxcui/${d.rxcui}/allProperties.json?prop=all`)) as {
      propConceptGroup?: { propConcept?: Array<{ propName: string; propValue: string }> };
    };
    const s = props.propConceptGroup?.propConcept?.find((p) => /SCHEDULE/i.test(p.propName));
    if (s && s.propValue !== '0') return { schedule: s.propValue, rxcui: d.rxcui, name: d.name };
    if (s) return { schedule: null, rxcui: d.rxcui, name: d.name };
  }
  return { schedule: null, rxcui: drugs[0]?.rxcui ?? null, name: drugs[0]?.name ?? null };
}

/** Plain text of one SPL section by LOINC code. */
export function sectionText(xml: string, loinc: string): string | null {
  const at = xml.indexOf(`code="${loinc}"`);
  if (at === -1) return null;
  const start = xml.lastIndexOf('<section', at);
  if (start === -1) return null;
  let depth = 0;
  const re = /<(\/?)section\b[^>]*>/g;
  re.lastIndex = start;
  let end = -1;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) {
      end = m.index + m[0].length;
      break;
    }
  }
  if (end === -1) return null;
  return normalizeText(xml.slice(start, end).replace(/<[^>]+>/g, ' '));
}

export const normalizeText = (s: string) =>
  s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8804;/g, '≤')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface LabelSection {
  setid: string;
  title: string;
  url: string;
  text: string;
  /** Active ingredient strengths in mg of the products this label covers (SPL product data). */
  productMg: number[];
}

/** Strengths in mg of the active ingredients in an SPL's product data. */
export function productStrengthsMg(xml: string): number[] {
  const out = new Set<number>();
  for (const m of xml.matchAll(/<ingredient classCode="ACTI[BMR]">\s*<quantity>\s*<numerator ([^>]*)\/?>/g)) {
    const value = m[1].match(/value="([\d.]+)"/)?.[1];
    const unit = m[1].match(/unit="([a-z]+)"/)?.[1];
    if (!value || !unit || !['mg', 'ug', 'mcg', 'g'].includes(unit)) continue;
    const v = Number(value) * (unit === 'g' ? 1000 : unit === 'mg' ? 1 : 0.001);
    out.add(Math.round(v * 1e6) / 1e6);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * The Dosage and Administration text of one FDA label for a product. `mustHave` and `mustNotHave`
 * are words the SPL title must or must not contain, such as "EXTENDED RELEASE" or "TABLET".
 */
export async function dosageSection(generic: string, mustHave: string[], mustNotHave: string[], prefer_: string[] = [], skip = 0): Promise<LabelSection | null> {
  const ings = ingredientsOf(generic);
  const q = encodeURIComponent(ings.join(' and '));
  const list = JSON.parse(await cached(`https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${q}&pagesize=100`)) as { data?: Array<{ setid: string; title: string }> };
  const titles = (list.data ?? []).filter((d) => {
    const t = d.title.toUpperCase();
    const named = t.split('[')[0];
    const nameOnly = named.split(/\b(TABLET|CAPSULE|SOLUTION|INJECTION|SUSPENSION|CREAM|OINTMENT|PATCH|KIT|GEL|SPRAY|POWDER|SYRUP|LIQUID|FILM|AEROSOL)\b/)[0];
    const combo = /\bAND\b|\/|,/.test(nameOnly);
    return ings.every((i) => named.includes(i.toUpperCase())) && (ings.length > 1 || !combo) && mustHave.every((w) => t.includes(w.toUpperCase())) && !mustNotHave.some((w) => t.includes(w.toUpperCase()));
  });
  const prefer = prefer_.map((w) => w.toUpperCase());
  titles.sort((a, b) => Number(prefer.some((w) => b.title.toUpperCase().includes(w))) - Number(prefer.some((w) => a.title.toUpperCase().includes(w))));
  let seen = 0;
  for (const d of titles.slice(0, 4 + skip)) {
    const xml = await cached(`https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${d.setid}.xml`);
    const text = sectionText(xml, '34068-7');
    if (text && text.length > 200 && seen++ >= skip) return { setid: d.setid, title: d.title, url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${d.setid}`, text, productMg: productStrengthsMg(xml) };
  }
  return null;
}

/** True when `quote` appears in `text`, ignoring case and whitespace. */
export function quoteFound(quote: string, text: string): boolean {
  const n = (s: string) => normalizeText(s).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s*\(\s*/g, ' (').replace(/\s+/g, ' ');
  return quote.trim().length >= 12 && n(text).includes(n(quote));
}

/** DailyMed titles for a drug: used to see whether a single-use or preservative-free package exists. */
export async function splTitles(generic: string): Promise<string[]> {
  const ings = ingredientsOf(generic);
  const list = JSON.parse(await cached(`https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${encodeURIComponent(ings.join(' and '))}&pagesize=100`)) as { data?: Array<{ title: string }> };
  return (list.data ?? []).map((d) => d.title).filter((t) => ings.every((i) => t.toUpperCase().split('[')[0].includes(i.toUpperCase())));
}
