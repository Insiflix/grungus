import { Component, type ErrorInfo, type ReactNode } from "react";

interface TimelineErrorBoundaryProps {
  children: ReactNode;
}

interface TimelineErrorBoundaryState {
  failed: boolean;
}

export class TimelineErrorBoundary extends Component<
  TimelineErrorBoundaryProps,
  TimelineErrorBoundaryState
> {
  state: TimelineErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): TimelineErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("The selected room could not be rendered", error, info);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="timeline-error" role="alert">
          <h2>This room could not be displayed.</h2>
          <p>The room list and application controls are still available.</p>
          <button type="button" onClick={() => this.setState({ failed: false })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
