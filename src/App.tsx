import { useState, useRef, useEffect } from 'react';
import { TabType } from './types/workshop';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { TaskWizard } from './components/TaskWizard';
import { ModelCatalog } from './components/ModelCatalog';
import { UseCaseStudio } from './components/UseCaseStudio';
import { OllamaDetector } from './components/OllamaDetector';
import { HardwareAdvisor } from './components/HardwareAdvisor';
import { ShortcutsStudio } from './components/ShortcutsStudio';
import { BenchmarkStudio } from './components/BenchmarkStudio';
import { FlowCanvas } from './components/FlowCanvas';
import { StepCard } from './components/StepCard';
import { Step, ExecutionStatus } from './types/flow';
import { FlowRunner } from './engine/flowRunner';
import { RunComparison } from './components/RunComparison';

type Theme = 'light' | 'dark';
const THEME_KEY = 'local-model-workshop-theme';

/** The saved choice if there is one, otherwise the system setting. Storage can be missing or blocked. */
function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // no storage, fall through to the system setting
  }
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Tabs that show the general introduction and the engine panel above their content. */
const REFERENCE_TABS: TabType[] = ['wizard', 'catalog', 'studio', 'hardware', 'shortcuts'];

function ErrorTrigger() {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('triggerError') === 'true') {
    throw new Error('Simulated runtime error for ErrorBoundary E2E testing');
  }
  return null;
}

export function App({ initialTab = 'builder' }: { initialTab?: TabType } = {}) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    // The page background outside the app follows the theme too.
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggleTheme = () =>
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        // the choice still applies for this visit
      }
      return next;
    });

  // Flow Builder Canvas state
  const [flowTitle, setFlowTitle] = useState('Linear Model Flow');
  const [initialInput, setInitialInput] = useState('Sample input text for the first step');
  const [flowStatus, setFlowStatus] = useState<ExecutionStatus>('idle');
  const [steps, setSteps] = useState<Step[]>([
    {
      id: 'step-0',
      name: 'Step 1: Summarize',
      prompt: 'Summarize the following topic: {{input}}',
      modelConfig: {
        provider: 'mock',
        model: 'mock-gpt-4o',
        temperature: 0.7,
        maxTokens: 500,
      },
      status: 'idle',
      output: '',
    },
  ]);

  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  const updateStepsState = (newSteps: Step[] | ((prev: Step[]) => Step[])) => {
    setSteps((prev) => {
      const next = typeof newSteps === 'function' ? newSteps(prev) : newSteps;
      stepsRef.current = next;
      return next;
    });
  };

  const handleAddStep = () => {
    updateStepsState((prev) => {
      let counter = prev.length;
      let newId = `step-${counter}`;
      while (prev.some((s) => s.id === newId)) {
        counter++;
        newId = `step-${counter}`;
      }

      const newStep: Step = {
        id: newId,
        name: `Step ${prev.length + 1}: Process`,
        prompt: prev.length === 0 ? 'Process: {{input}}' : `Process: {{step${prev.length}.output}}`,
        modelConfig: {
          provider: 'mock',
          model: 'mock-gpt-4o',
          temperature: 0.7,
          maxTokens: 500,
        },
        status: 'idle',
        output: '',
      };
      return [...prev, newStep];
    });
  };

  const handleUpdateStep = (index: number, updated: Step) => {
    updateStepsState((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    updateStepsState((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= stepsRef.current.length - 1) return;
    updateStepsState((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleDeleteStep = (index: number) => {
    if (stepsRef.current.length <= 1) return;
    updateStepsState((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRunFlow = async () => {
    if (flowStatus === 'running') return;
    setFlowStatus('running');

    const currentFlow = {
      id: 'flow-1',
      name: flowTitle,
      initialInput,
      steps: stepsRef.current,
    };

    const runner = new FlowRunner();
    try {
      const result = await runner.runFlow(currentFlow, {
        onStateChange: (_state, updatedFlow) => {
          updateStepsState(updatedFlow.steps);
        },
      });
      setFlowStatus(result.state.status);
      updateStepsState(result.flow.steps);
    } catch {
      setFlowStatus('error');
    }
  };

  const handleRunStep = async (index: number) => {
    if (flowStatus === 'running') return;
    setFlowStatus('running');

    const currentFlow = {
      id: 'flow-1',
      name: flowTitle,
      initialInput,
      steps: stepsRef.current,
    };

    const runner = new FlowRunner();
    try {
      const result = await runner.runSingleStep(currentFlow, index, {
        onStateChange: (_state, updatedFlow) => {
          updateStepsState(updatedFlow.steps);
        },
      });
      updateStepsState(result.flow.steps);
    } catch {
      // Step error recorded in runner
    } finally {
      setFlowStatus('idle');
    }
  };

  return (
    <div
      data-testid="app-container"
      data-theme={theme}
      className="min-h-screen bg-bench bench-grid text-ink flex flex-col font-sans antialiased"
    >
      <Header activeTab={activeTab} onTabChange={setActiveTab} theme={theme} onToggleTheme={toggleTheme} />

      <ErrorBoundary>
        <main className="flex-1 max-w-[1840px] w-full mx-auto px-4 py-5 sm:px-6 sm:py-6 space-y-6">
          <ErrorTrigger />
          {REFERENCE_TABS.includes(activeTab) && <Hero />}

          {REFERENCE_TABS.includes(activeTab) && <OllamaDetector />}

          {activeTab === 'compare' && <RunComparison />}

          {activeTab === 'wizard' && <TaskWizard />}

          {activeTab === 'catalog' && <ModelCatalog />}

          {activeTab === 'studio' && <UseCaseStudio />}

          {activeTab === 'hardware' && <HardwareAdvisor />}

          {activeTab === 'shortcuts' && <ShortcutsStudio />}

          {activeTab === 'benchmark' && <BenchmarkStudio />}

          {activeTab === 'builder' && (
            <FlowCanvas
              flowTitle={flowTitle}
              onFlowTitleChange={setFlowTitle}
              initialInput={initialInput}
              onInitialInputChange={setInitialInput}
              onAddStep={handleAddStep}
              onRunFlow={handleRunFlow}
              flowStatus={flowStatus}
            >
              {steps.map((step, idx) => (
                <StepCard
                  key={step.id || idx}
                  index={idx}
                  totalSteps={steps.length}
                  step={step}
                  onUpdateStep={(updated) => handleUpdateStep(idx, updated)}
                  onMoveUp={() => handleMoveUp(idx)}
                  onMoveDown={() => handleMoveDown(idx)}
                  onDeleteStep={() => handleDeleteStep(idx)}
                  onRunStep={() => handleRunStep(idx)}
                  flowStatus={flowStatus}
                />
              ))}
            </FlowCanvas>
          )}
        </main>
      </ErrorBoundary>

      <footer className="border-t-2 border-ink bg-panel">
        <div className="mx-auto flex max-w-[1840px] flex-wrap gap-x-6 gap-y-1 px-4 py-4 font-mono text-[12px] text-ink-3 sm:px-6">
          <span>Local Model Workshop</span>
          <span>MIT License</span>
          <span>Synthetic examples and public label excerpts. See the source licenses.</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
