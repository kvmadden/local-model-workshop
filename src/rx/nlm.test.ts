import { describe, it, expect } from 'vitest';
import { ingredientsOf, productStrengthsMg, quoteFound, sectionText } from './nlm';

const xml = `<document><section><code code="34067-9"/><text>Indications</text></section>
<section><code code="34068-7"/><title>2 DOSAGE AND ADMINISTRATION</title><text>Do not exceed <b>6 tablets</b> in 24&#160;hours.</text>
<section><code code="42229-5"/><text>Nested part.</text></section></section>
<manufacturedProduct><ingredient classCode="ACTIB"><quantity><numerator unit="mg" value="50"/><denominator unit="1" value="1"/></quantity></ingredient>
<ingredient classCode="ACTIB"><quantity><numerator value="325" unit="mg"/></quantity></ingredient>
<ingredient classCode="IACT"><quantity><numerator unit="mg" value="999"/></quantity></ingredient>
<ingredient classCode="ACTIM"><quantity><numerator unit="ug" value="125"/></quantity></ingredient></manufacturedProduct></document>`;

describe('nlm helpers', () => {
  it('reads one SPL section with its nested parts as plain text', () => {
    expect(sectionText(xml, '34068-7')).toBe('2 DOSAGE AND ADMINISTRATION Do not exceed 6 tablets in 24 hours. Nested part.');
    expect(sectionText(xml, '99999-9')).toBeNull();
  });
  it('reads active ingredient strengths in mg, in either attribute order, and skips inactive ones', () => {
    expect(productStrengthsMg(xml)).toEqual([0.125, 50, 325]);
  });
  it('splits ingredients and drops salt and release words', () => {
    expect(ingredientsOf('Hydrocodone bitartrate/acetaminophen')).toEqual(['hydrocodone', 'acetaminophen']);
    expect(ingredientsOf('Bupropion XL')).toEqual(['bupropion']);
  });
  it('finds a quote regardless of case and spacing, and refuses a short one', () => {
    expect(quoteFound('do not  EXCEED 6 tablets', 'Do not exceed 6 tablets in 24 hours.')).toBe(true);
    expect(quoteFound('6 tablets', 'Do not exceed 6 tablets.')).toBe(false);
  });
});
