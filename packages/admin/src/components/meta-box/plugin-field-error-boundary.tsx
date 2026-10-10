import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { Trans } from "@lingui/react";

// A class because React 19 still has no hook for `componentDidCatch`.

interface Props {
  readonly fieldKey: string;
  readonly inputType: string;
  readonly testId: string;
  // A change clears the error and re-attempts the render.
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
          <Trans
            id="metaBox.pluginField.crashed"
            message="This field couldn’t render. Check the browser console for details."
          />
        </p>
      );
    }
    return this.props.children;
  }
}
