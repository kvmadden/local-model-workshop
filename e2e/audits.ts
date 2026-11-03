/**
 * Layout and accessibility audits that run inside the page. Each one is a self-contained function
 * passed to page.evaluate, so it can only use what it defines itself. Each returns a list of
 * problems, so a test can assert an empty list and print exactly what failed.
 */

/**
 * Kevin's rules for boxed text and for step flows.
 *
 * 1. A pill, chip, badge or any other boxed bit of text keeps clear room inside its border, ring
 *    or background: at least 4 px beside the text and at least 1 px above and below the letters,
 *    and nothing clipped.
 * 2. A step flow ([data-step-flow] with [data-step] children) sits on one line, or every step
 *    stacks cleanly, one per line. It never wraps partway. Any other text with an arrow in it
 *    stays on one line.
 */
export function auditBoxesAndFlows(): { boxes: string[]; flows: string[] } {
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
  };
  const color = (c: string) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const sides = (cs: CSSStyleDeclaration) =>
    (['Left', 'Right'] as const).every((s) => parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0 && (color(cs.getPropertyValue(`border-${s.toLowerCase()}-color`))?.a ?? 0) > 0);
  // A ring drawn with box-shadow (no offset, no blur, some spread) frames text the way a border does.
  const ringed = (cs: CSSStyleDeclaration) =>
    cs.boxShadow !== 'none' &&
    cs.boxShadow.split(/,(?![^(]*\))/).some((part) => {
      const [x = 0, y = 0, blur = 0, spread = 0] = part.replace(/rgba?\([^)]*\)/g, '').trim().split(/\s+/).filter((t) => t.endsWith('px')).map(parseFloat);
      return x === 0 && y === 0 && blur === 0 && spread > 0 && (color(part)?.a ?? 0) > 0.2;
    });
  const parentBg = (el: Element) => {
    for (let e = el.parentElement; e; e = e.parentElement) {
      const c = color(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const differs = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > 6;
  const name = (el: Element) => {
    const id = el.closest('[data-testid]')?.getAttribute('data-testid');
    return `${el.tagName.toLowerCase()}${id ? ` in ${id}` : ''}`;
  };
  const textRects = (el: Element) => {
    const out: Array<{ rect: DOMRect; font: number }> = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n as Text;
      if (!t.data.trim() || !t.parentElement || !visible(t.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      const font = parseFloat(getComputedStyle(t.parentElement).fontSize);
      for (const rect of Array.from(range.getClientRects())) if (rect.width > 0 && rect.height > 0) out.push({ rect, font });
    }
    return out;
  };

  const boxes: string[] = [];
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    if (['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'svg'].includes(el.tagName) || el.closest('svg') || !visible(el)) continue;
    const text = ((el as HTMLElement).innerText || '').trim();
    if (!text || text.length > 40) continue;
    const box = el.getBoundingClientRect();
    if (box.height > 64) continue;
    const cs = getComputedStyle(el);
    const bg = color(cs.backgroundColor);
    const boxed = sides(cs) || ringed(cs) || (!!bg && bg.a > 0.05 && differs(bg, parentBg(el)));
    if (!boxed) continue;
    const rects = textRects(el);
    if (rects.length === 0) continue;
    const inner = {
      left: box.left + parseFloat(cs.borderLeftWidth),
      right: box.right - parseFloat(cs.borderRightWidth),
      top: box.top + parseFloat(cs.borderTopWidth),
      bottom: box.bottom - parseFloat(cs.borderBottomWidth),
    };
    // Letters sit inside the line box. Their height is about the font size, centered in it.
    const left = Math.min(...rects.map((r) => r.rect.left)) - inner.left;
    const right = inner.right - Math.max(...rects.map((r) => r.rect.right));
    const top = Math.min(...rects.map((r) => r.rect.top + Math.max(0, (r.rect.height - r.font) / 2))) - inner.top;
    const bottom = inner.bottom - Math.max(...rects.map((r) => r.rect.bottom - Math.max(0, (r.rect.height - r.font) / 2)));
    const clipped = (cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1) || (cs.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 1);
    if (left < 4 || right < 4 || top < 1 || bottom < 1 || clipped) {
      boxes.push(`${name(el)} "${text.replace(/\s+/g, ' ').slice(0, 32)}": room left ${left.toFixed(1)}, right ${right.toFixed(1)}, top ${top.toFixed(1)}, bottom ${bottom.toFixed(1)}${clipped ? ', clipped' : ''}`);
    }
  }

  const flows: string[] = [];
  const lineCount = (el: Element) => new Set(textRects(el).map((r) => Math.round(r.rect.top))).size;
  for (const flow of Array.from(document.querySelectorAll('[data-step-flow]'))) {
    if (!visible(flow)) continue;
    const steps = Array.from(flow.querySelectorAll('[data-step]')).filter(visible);
    const rects = steps.map((s) => s.getBoundingClientRect());
    if (rects.length < 2) continue;
    const oneLine = rects.every((r) => Math.abs(r.top - rects[0].top) < 2) && flow.scrollWidth <= flow.clientWidth + 1;
    const stacked = rects.every((r, i) => i === 0 || r.top >= rects[i - 1].bottom - 1);
    if (!oneLine && !stacked) flows.push(`${name(flow)}: steps wrap partway`);
    for (const s of steps) if (lineCount(s) > 1) flows.push(`${name(flow)}: step "${(s as HTMLElement).innerText.trim().slice(0, 30)}" breaks over two lines`);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    if (!/→|⟶|->/.test(t.data) || !t.parentElement || t.parentElement.closest('[data-step-flow], textarea, pre, code, script, style') || !visible(t.parentElement)) continue;
    const range = document.createRange();
    range.selectNodeContents(t);
    const tops = new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top)));
    if (tops.size > 1) flows.push(`${name(t.parentElement)}: "${t.data.trim().slice(0, 40)}" wraps an arrow flow across lines`);
  }
  return { boxes, flows };
}

/** Text contrast against the color actually behind it, with semi-transparent layers composited. */
export function auditContrast(): string[] {
  const color = (c: string) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  type C = { r: number; g: number; b: number; a: number };
  const over = (top: C, base: C): C => ({ r: top.r * top.a + base.r * (1 - top.a), g: top.g * top.a + base.g * (1 - top.a), b: top.b * top.a + base.b * (1 - top.a), a: 1 });
  const background = (el: Element): C => {
    const layers: C[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = color(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
    }
    let base: C = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers.reverse()) base = over(layer, base);
    return base;
  };
  const lum = (c: C) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a: C, b: C) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const failures: string[] = [];
  const seen = new Set<Element>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = (n as Text).parentElement;
    if (!el || seen.has(el) || !(n as Text).data.trim()) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.closest('[disabled], [aria-disabled="true"], .sr-only, svg')) continue;
    let opacity = 1;
    for (let e: Element | null = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    if (opacity < 0.99) continue;
    const bg = background(el);
    const fg = over(color(cs.color) ?? { r: 0, g: 0, b: 0, a: 1 }, bg);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(fg, bg);
    if (got < need) {
      const id = el.closest('[data-testid]')?.getAttribute('data-testid');
      failures.push(`${el.tagName.toLowerCase()}${id ? ` in ${id}` : ''} "${(n as Text).data.trim().slice(0, 30)}": ${got.toFixed(2)} < ${need}`);
    }
  }
  return failures;
}

/** Controls a finger or a pointer must hit: at least 44 by 44 px. Links inside running text are exempt. */
export function auditTargets(): string[] {
  const failures: string[] = [];
  const controls = document.querySelectorAll('button, a[href], select, [role="button"], input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), textarea');
  for (const el of Array.from(controls)) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.tagName === 'A' && cs.display === 'inline') continue;
    if (el.closest('.sr-only')) continue;
    if (r.width < 43.5 || r.height < 43.5) {
      const id = el.getAttribute('data-testid') ?? el.closest('[data-testid]')?.getAttribute('data-testid');
      failures.push(`${el.tagName.toLowerCase()}${id ? ` ${id}` : ''} "${((el as HTMLElement).innerText || el.getAttribute('aria-label') || '').trim().slice(0, 24)}": ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  return failures;
}

/**
 * Kevin's ask for a calm screen, checked on the run comparison: no forced capitals, one sans face
 * plus its monospace sibling for the medication lines only, no rule heavier than a hairline (the
 * open answer toggle keeps its 2 px underline), and red text only inside a missed-field mark.
 */
export function auditCalm(): { caps: string[]; faces: string[]; mono: string[]; red: string[]; heavy: string[] } {
  const root = document.querySelector('[data-testid="run-comparison"]');
  const out = { caps: [] as string[], faces: [] as string[], mono: [] as string[], red: [] as string[], heavy: [] as string[] };
  if (!root) return out;
  const alert = `rgb(${getComputedStyle(document.documentElement).getPropertyValue('--alert-text').trim().split(/\s+/).join(', ')})`;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = (n as Text).parentElement;
    const text = (n as Text).data.trim();
    if (!el || !text || el.closest('.sr-only, script, style') || el.getBoundingClientRect().width < 1) continue;
    const cs = getComputedStyle(el);
    const face = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (cs.textTransform === 'uppercase') out.caps.push(text.slice(0, 30));
    if (!out.faces.includes(face)) out.faces.push(face);
    if (/mono/i.test(face) && !el.closest('.sig')) out.mono.push(text.slice(0, 30));
    if (root.contains(el) && cs.color === alert && !el.closest('[data-miss]')) out.red.push(text.slice(0, 30));
  }
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const cs = getComputedStyle(el);
    const widths = ['top', 'right', 'bottom', 'left'].map((s) => parseFloat(cs.getPropertyValue(`border-${s}-width`)));
    const toggle = el.matches('[data-testid^="detail-column-"]') && widths[0] === 0 && widths[1] === 0 && widths[3] === 0;
    if (Math.max(...widths) > 1 && !toggle) out.heavy.push([el.tagName.toLowerCase(), el.getAttribute('data-testid'), widths.join('/')].filter(Boolean).join(' '));
  }
  return out;
}
