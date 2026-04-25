import type { ReactNode } from "react";
import { Component } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { AlertTriangle } from "lucide-react";

type Kind = "page" | "icon" | "block" | "field";

interface Props {
  readonly kind: Kind;
  readonly pluginLabel?: string;
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

/**
 * Catch render errors in plugin-supplied components so a third-party
 * bug doesn't take down the surrounding admin shell. Each kind picks
 * a fallback shape that fits its host context: pages get a full-card
 * alert, icons get a tiny warning glyph, blocks/fields get inline
 * stubs.
 */
export class PluginErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    console.error("[plumix] plugin component threw:", error);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    const { kind, pluginLabel } = this.props;
    const message = this.state.error.message;
    const label = pluginLabel ?? "this plugin";

    if (kind === "icon") {
      return (
        <AlertTriangle
          aria-label="Plugin icon failed to render"
          className="text-destructive"
          data-testid="plugin-icon__error"
        />
      );
    }

    if (kind === "page") {
      return (
        <div
          className="mx-auto max-w-2xl py-12"
          data-testid="plugin-page__error"
        >
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              <p className="font-semibold">Plugin page failed to render</p>
              <p className="mt-1">
                {label} threw an error while rendering. The rest of the admin is
                unaffected.
              </p>
              <pre className="bg-muted mt-2 overflow-x-auto rounded p-2 font-mono text-xs">
                {message}
              </pre>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    // Inline stub for blocks (editor) and field types (forms).
    return (
      <span
        className="border-destructive/50 bg-destructive/10 text-destructive inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs"
        data-testid={`plugin-${kind}__error`}
        title={message}
      >
        <AlertTriangle className="size-3" />
        {label} {kind} failed
      </span>
    );
  }
}
