import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Top-level render-error firewall. A bug in any one component (a bad API shape, a null
 * dereference in a chart, whatever) would otherwise unmount the whole React tree and blank the
 * page. This catches it, shows a recoverable card instead, and logs the error for diagnosis.
 *
 * Class component because componentDidCatch/getDerivedStateFromError have no hook equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="page container" style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="card" role="alert" style={{ maxWidth: 480, textAlign: 'center' }}>
          <h1 className="card-title" style={{ fontSize: '1.5rem' }}>
            Something went wrong
          </h1>
          <p className="muted" style={{ margin: '12px 0 20px' }}>
            This page hit an unexpected error. Reloading usually fixes it.
          </p>
          <button type="button" className="btn btn-lg btn-blurple" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
