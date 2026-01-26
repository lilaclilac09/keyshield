import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
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
    console.error('KeyShield Error Boundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#131314] text-zinc-400 flex items-center justify-center font-mono p-8">
          <div className="max-w-2xl space-y-6">
            <h1 className="text-2xl font-bold text-red-500">⚠️ Error Loading KeyShield</h1>
            <div className="bg-[#1e1f20] border border-red-900/50 p-6 rounded-sm">
              <p className="text-sm text-zinc-300 mb-4">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              <details className="text-xs text-zinc-600">
                <summary className="cursor-pointer mb-2">Stack Trace</summary>
                <pre className="mt-2 overflow-auto">
                  {this.state.error?.stack}
                </pre>
              </details>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-sm font-bold text-sm"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
