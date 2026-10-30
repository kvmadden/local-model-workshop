import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid="error-boundary-fallback"
          className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl max-w-xl mx-auto my-12 text-center space-y-6"
        >
          <div className="w-16 h-16 bg-rose-950/80 border border-rose-800/80 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
            <AlertOctagon className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight">
              Something went wrong
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
              An unexpected error occurred while loading or running this view. Don't worry, your hardware and local model files remain completely safe.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              data-testid="reset-app-btn"
              onClick={this.handleReset}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 mx-auto shadow-lg shadow-indigo-950/50 transition-colors cursor-pointer min-h-[44px]"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
