import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

// Render-time crash containment for plugin-supplied field components.
// One bad plugin field shouldn't take down the whole entry editor —
// when the registered renderer throws we catch it, log to the console
// for the developer, and fall back to a static "this field couldn't
// render" placeholder so the rest of the form stays usable.
//
// Adapted from emdash's PluginFieldErrorBoundary pattern. Class
// component because React error boundaries still require it (no hook
// equivalent exists for `componentDidCatch` as of React 19).

interface Props {
  readonly fieldKey: string;
  readonly inputType: string;
  readonly testId: string;
  /**
   * Reset signal — bumped by the parent when the field's value changes.
   * When `resetKey` differs from the last one we caught against, we
   * clear the error state and re-attempt the render. Without this the
   * boundary stays in error state forever after one bad render, so a
   * user who picks a different (valid) value can never recover.
   */
  readonly resetKey: string;
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
  readonly resetKey: string;
}

export class PluginFieldErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(
    nextProps: Props,
    state: State,
  ): Partial<State> | null {
    if (nextProps.resetKey !== state.resetKey) {
      return { error: null, resetKey: nextProps.resetKey };
    }
    return null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[plumix] plugin field renderer for "${this.props.inputType}" ` +
        `(field "${this.props.fieldKey}") crashed:`,
      error,
      info,
    );
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <p
          className="text-destructive text-sm"
          data-testid={`${this.props.testId}-plugin-error`}
        >
          This field couldn&rsquo;t render. Check the browser console for
          details.
        </p>
      );
    }
    return this.props.children;
  }
}
