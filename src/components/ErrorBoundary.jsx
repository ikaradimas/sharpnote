import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '40px', color: '#e0e0e0', background: '#1a1a2e',
          fontFamily: 'monospace', height: '100vh', boxSizing: 'border-box',
        }}>
          <h2 style={{ color: '#ff6b6b', marginTop: 0 }}>Something went wrong</h2>
          <p style={{ color: '#aaa' }}>The application encountered an unexpected error. Your notebooks are safe on disk.</p>
          <pre style={{
            background: '#111', padding: '16px', borderRadius: '6px',
            overflow: 'auto', fontSize: '12px', maxHeight: '300px',
            border: '1px solid #333',
          }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: '16px', padding: '8px 20px', background: '#4fc3f7',
              color: '#111', border: 'none', borderRadius: '4px', cursor: 'pointer',
              fontWeight: 600, fontSize: '13px',
            }}
          >
            Try to Recover
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
