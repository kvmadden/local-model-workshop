import React, { useLayoutEffect, useRef, useState } from 'react';

/**
 * A step flow such as "Drop audio file → Transcribe → Export notes". It sits on one line when the
 * whole flow fits, and otherwise stacks one step per line with a down arrow. It never wraps partway.
 *
 * The fit is measured from the steps' own widths, which do not change between the two layouts, so
 * the flow can switch back to one line when there is room again.
 */
export const StepFlow: React.FC<{ text?: string; steps?: string[]; className?: string; stepClassName?: string; testId?: string }> = ({
  text = '',
  steps,
  className = '',
  stepClassName = '',
  testId,
}) => {
  const items = steps ?? text.split(/\s*→\s*/).filter(Boolean);
  const ref = useRef<HTMLOListElement>(null);
  const [stacked, setStacked] = useState(false);

  useLayoutEffect(() => {
    const list = ref.current;
    if (!list || items.length < 2 || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const stepEls = Array.from(list.querySelectorAll<HTMLElement>('[data-step]'));
      const arrow = list.querySelector<HTMLElement>('[data-arrow]');
      const gap = parseFloat(getComputedStyle(list).columnGap || '0') || 0;
      const needed = stepEls.reduce((sum, s) => sum + s.getBoundingClientRect().width, 0) + (stepEls.length - 1) * ((arrow?.getBoundingClientRect().width ?? 12) + 2 * gap);
      setStacked(needed > list.clientWidth + 0.5);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [items.join('\u0000')]);

  if (items.length < 2) {
    return <span data-testid={testId} className={className}>{items[0] ?? text}</span>;
  }
  return (
    <ol
      ref={ref}
      data-step-flow
      data-testid={testId}
      data-layout={stacked ? 'stacked' : 'one-line'}
      className={`m-0 flex list-none gap-x-2 gap-y-1 p-0 ${stacked ? 'flex-col items-start' : 'flex-row items-center'} ${className}`}
    >
      {items.map((step, i) => (
        <React.Fragment key={`${i}-${step}`}>
          {i > 0 && (
            <li data-arrow aria-hidden="true" className="shrink-0 font-mono leading-none text-ink-3">
              {stacked ? '↓' : '→'}
            </li>
          )}
          <li data-step className={`w-max max-w-full whitespace-nowrap ${stepClassName}`}>
            {step}
          </li>
        </React.Fragment>
      ))}
    </ol>
  );
};
