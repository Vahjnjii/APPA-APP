import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      let firestoreInfo = null;

      try {
        if (this.state.error?.message) {
          firestoreInfo = JSON.parse(this.state.error.message);
          if (firestoreInfo.error) {
            errorMessage = `Database Error: ${firestoreInfo.error}`;
          }
        }
      } catch (e) {
        // Not a JSON error
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-stone-200 text-center space-y-6">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-12 h-12 text-red-600" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-stone-800">Oops!</h2>
              <p className="text-stone-500 font-medium">{errorMessage}</p>
              {firestoreInfo && (
                <div className="mt-4 p-3 bg-stone-50 rounded-xl text-left text-[10px] font-mono text-stone-400 overflow-auto max-h-32">
                  <p>Operation: {firestoreInfo.operationType}</p>
                  <p>Path: {firestoreInfo.path}</p>
                  <p>User: {firestoreInfo.authInfo?.userId || 'Not logged in'}</p>
                </div>
              )}
            </div>

            <button
              onClick={this.handleReset}
              className="w-full py-4 bg-orange-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-orange-700 transition-all shadow-lg shadow-orange-100"
            >
              <RefreshCcw className="w-5 h-5" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
