import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-2xl w-full border border-red-200 dark:border-red-900">
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
              Ops! Algo deu errado.
            </h1>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Ocorreu um erro inesperado na aplicação. Por favor, tente recarregar a página.
            </p>
            
            <div className="bg-gray-100 dark:bg-black p-4 rounded overflow-auto max-h-64 mb-6 text-sm font-mono">
              <p className="text-red-500 font-bold mb-2">{this.state.error && this.state.error.toString()}</p>
              <pre className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded transition-colors"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
