/**
 * Visual identity: quiet and readable, like a well-set pharmacy label.
 *
 * Colors come from CSS variables in src/index.css, so one set of class names serves both themes.
 * The page is neutral, with one blue accent for links, focus and selection. Red marks a missed
 * field and nothing else on the run comparison.
 *
 * Type is Atkinson Hyperlegible Next, a face drawn for low-vision readers, in sentence case. Its
 * monospace sibling sets the medication instructions themselves, where a misread 1 or l matters.
 *
 * The component code still uses Tailwind's slate, indigo, emerald, sky, amber and rose names.
 * They are mapped here: slate is the neutral scale, indigo, emerald and sky are the accent, amber
 * is a muted neutral for notes and pending states, and rose is the alert red.
 */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const scale = (family) => Object.fromEntries(steps.map((s) => [s, v(`${family}-${s}`)]));

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: { ...scale('slate'), 850: v('slate-850') },
        indigo: scale('accent'),
        emerald: scale('accent'),
        sky: scale('accent'),
        amber: { ...scale('muted'), 850: v('slate-850') },
        rose: scale('alert'),
        bench: v('bench'),
        panel: v('panel'),
        inset: v('slate-950'),
        rule: v('rule'),
        'rule-strong': v('rule-strong'),
        field: v('field'),
        ink: v('ink'),
        'ink-2': v('ink-2'),
        'ink-3': v('ink-3'),
        accent: v('accent-text'),
        'accent-fill': v('accent-600'),
        'accent-tint': v('accent-950'),
        alert: v('alert-text'),
        'alert-tint': v('alert-950'),
        selected: v('selected'),
      },
      fontFamily: {
        sans: ['"Atkinson Hyperlegible Next"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"Atkinson Hyperlegible Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.25rem' }],
        sm: ['0.875rem', { lineHeight: '1.375rem' }],
        base: ['1rem', { lineHeight: '1.625rem' }],
      },
      // Bold is set one step lighter everywhere, so headings and labels read calm rather than loud.
      fontWeight: {
        bold: '600',
        extrabold: '700',
        black: '700',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '8px',
        xl: '10px',
        '2xl': '12px',
        '3xl': '16px',
      },
      boxShadow: {
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
        inner: 'none',
      },
    },
  },
  plugins: [],
};
