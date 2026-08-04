import { Component, type ErrorInfo, type ReactNode } from "react";

type FallbackProps = {
  error: Error;
  reset: () => void;
  title?: string;
  hint?: string;
};

export function ErrorFallback({
  error,
  reset,
  title = "Something went wrong",
  hint = "An unexpected error stopped this screen from rendering. You can try again or head back home.",
}: FallbackProps) {
  const isDev = import.meta.env.DEV;

  return (
    <div className="error-boundary" role="alert">
      <div className="error-boundary-card">
        <p className="error-boundary-kicker">Error</p>
        <h1>{title}</h1>
        <p className="error-boundary-hint">{hint}</p>
        {isDev && (
          <pre className="error-boundary-detail">
            {error.name}: {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
          </pre>
        )}
        <div className="error-boundary-actions">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}

type BoundaryProps = {
  children: ReactNode;
  title?: string;
  hint?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
  onReset?: () => void;
  resetKeys?: unknown[];
};

type BoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps: BoundaryProps) {
    if (!this.state.error || !this.props.resetKeys) return;
    const prev = prevProps.resetKeys || [];
    const next = this.props.resetKeys;
    if (
      prev.length !== next.length ||
      prev.some((key, i) => !Object.is(key, next[i]))
    ) {
      this.setState({ error: null });
    }
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <ErrorFallback
          error={error}
          reset={this.reset}
          title={this.props.title}
          hint={this.props.hint}
        />
      );
    }
    return this.props.children;
  }
}
