/**
 * Visual identity: a pharmacy verification bench.
 *
 * Colors come from CSS variables in src/index.css, so one set of class names serves both themes.
 * The light theme is white label stock on a cool steel bench. The dark theme is the same labels
 * on a black epoxy lab bench. Ink is near-black, label tape is yellow, the verification stamp is
 * blue and a miss is red.
 *
 * The component code still uses Tailwind's slate, indigo, emerald, amber, rose and sky names.
 * They are mapped onto the bench palette here: slate is the neutral bench and ink scale, indigo,
 * emerald and sky are the stamp blue, amber is the tape and rose is the alert.
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
        indigo: scale('stamp'),
        emerald: scale('stamp'),
        sky: scale('stamp'),
        amber: scale('tape'),
        rose: scale('alert'),
        bench: v('bench'),
        panel: v('panel'),
        raised: v('raised'),
        rule: v('rule'),
        'rule-strong': v('rule-strong'),
        ink: v('ink'),
        'ink-2': v('ink-2'),
        'ink-3': v('ink-3'),
        label: v('label'),
        'label-ink': v('label-ink'),
        tape: v('tape'),
        'tape-ink': v('tape-ink'),
        stamp: v('stamp-text'),
        'stamp-fill': v('stamp-600'),
        alert: v('alert-text'),
        'alert-fill': v('alert-600'),
        'alert-tint': v('alert-950'),
        'stamp-tint': v('stamp-950'),
        'tape-tint': v('tape-950'),
      },
      fontFamily: {
        sans: ['Barlow', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Barlow', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        sm: '1px',
        DEFAULT: '2px',
        md: '2px',
        lg: '2px',
        xl: '3px',
        '2xl': '3px',
        '3xl': '4px',
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
      letterSpacing: {
        label: '0.08em',
      },
    },
  },
  plugins: [],
};
