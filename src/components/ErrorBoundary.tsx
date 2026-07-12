import { Component, type ReactNode } from 'react';

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('App crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1C1C1E', color: '#F2F2F2', padding: 24, fontFamily: 'sans-serif' }}>
          <div style={{ maxWidth: 480, textAlign: 'center' }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              style={{ background: '#0A84FF', color: 'white', border: 0, borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
