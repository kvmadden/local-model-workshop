/**
 * task_wizard_a11y_stress.test.tsx
 * Accessibility tests for the TaskWizard.tsx modal
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { TaskWizard } from './TaskWizard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('TaskWizard Modal Accessibility & Focus Trap Empirical Suite', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
  });

  const renderComponent = async (element: React.ReactElement) => {
    await act(async () => {
      root!.render(element);
    });
  };

  const getByTestId = (testId: string): HTMLElement | null => {
    return container?.querySelector(`[data-testid="${testId}"]`) || null;
  };

  const waitMs = async (ms = 100) => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  };

  it('1. Opening modal auto-focuses the first focusable element inside the modal after timeout', async () => {
    await renderComponent(<TaskWizard />);
    const triggerBtn = getByTestId('view-setup-guide-btn');
    expect(triggerBtn).not.toBeNull();

    await act(async () => {
      triggerBtn?.click();
    });

    const modal = getByTestId('task-setup-modal');
    expect(modal).not.toBeNull();

    // Wait for the 50ms setTimeout auto-focus
    await waitMs(100);

    const closeBtn = getByTestId('close-task-modal-btn');
    expect(document.activeElement).toBe(closeBtn);
  });

  it('2. Focus trap: TAB from last focusable element wraps to first, SHIFT+TAB from first wraps to last', async () => {
    await renderComponent(<TaskWizard />);
    const triggerBtn = getByTestId('view-setup-guide-btn');

    await act(async () => {
      triggerBtn?.click();
    });

    await waitMs(100);

    const modal = getByTestId('task-setup-modal') as HTMLElement;
    expect(modal).not.toBeNull();

    const focusables = Array.from(
      modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    );
    expect(focusables.length).toBeGreaterThan(1);

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    // Focus last element and dispatch Tab keydown
    await act(async () => {
      last.focus();
    });
    expect(document.activeElement).toBe(last);

    await act(async () => {
      const tabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        code: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(tabEvent);
    });

    expect(document.activeElement).toBe(first);

    // Focus first element and dispatch Shift+Tab keydown
    await act(async () => {
      first.focus();
    });
    expect(document.activeElement).toBe(first);

    await act(async () => {
      const shiftTabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        code: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(shiftTabEvent);
    });

    expect(document.activeElement).toBe(last);
  });

  it('3. Pressing Escape key closes the modal', async () => {
    await renderComponent(<TaskWizard />);
    const triggerBtn = getByTestId('view-setup-guide-btn');

    await act(async () => {
      triggerBtn?.click();
    });

    expect(getByTestId('task-setup-modal')).not.toBeNull();

    await act(async () => {
      const escEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(escEvent);
    });

    expect(getByTestId('task-setup-modal')).toBeNull();
  });

  it('4. Focus return to trigger element check when modal is closed', async () => {
    await renderComponent(<TaskWizard />);
    const triggerBtn = getByTestId('view-setup-guide-btn') as HTMLElement;
    
    await act(async () => {
      triggerBtn.focus();
    });
    expect(document.activeElement).toBe(triggerBtn);

    await act(async () => {
      triggerBtn.click();
    });
    expect(getByTestId('task-setup-modal')).not.toBeNull();

    await act(async () => {
      const escEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(escEvent);
    });

    expect(getByTestId('task-setup-modal')).toBeNull();

    // Check document active element
    console.log('Active element after Escape:', document.activeElement?.getAttribute('data-testid'));
    expect(document.activeElement).toBe(triggerBtn);
  });
});
