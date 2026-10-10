import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { Component } from "react";
import { i18n } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import { Alert, AlertDescription } from "@plumix/admin-ui/alert";
import { AlertTriangle } from "@plumix/admin-ui/icons";

type Kind = "page" | "widget" | "icon" | "block" | "field";

interface Props {
  readonly kind: Kind;
  readonly pluginLabel?: string;
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

const M = {
  // Default label when a plugin doesn't ship its own — appears
  // anywhere a plugin component crashes without identifying itself.
  unknownPlugin: defineMessage({
    id: "plugin.errorBoundary.unknownPlugin",
    message: "this plugin",
  }),
  // Full-card alert for top-level page render failures.
  pageTitle: defineMessage({
    id: "plugin.errorBoundary.pageTitle",
    message: "Plugin page failed to render",
  }),
  pageBody: defineMessage({
    id: "plugin.errorBoundary.pageBody",
    message:
      "{label} threw an error while rendering. The rest of the admin is unaffected.",
    comment:
      "label: a plugin-author-provided name (e.g. 'SEO meta', 'Hero block')",
  }),
  // Card-body alert for a dashboard widget — the host already supplies
  // the card chrome and title, so this fills just the body.
  widgetBody: defineMessage({
    id: "plugin.errorBoundary.widgetBody",
    message: "{label} failed to render.",
    comment: "label: a plugin-author-provided name (e.g. 'SEO meta')",
  }),
  // `{kind}` is the raw protocol discriminator, like other protocol
  // identifiers.
  inlineStub: defineMessage({
    id: "plugin.errorBoundary.inlineStub",
    message: "{label} {kind} failed",
    comment:
      "label: a plugin-author-provided name (e.g. 'SEO meta', 'Hero block'); kind: the extension type ('field', 'block', 'mark') left as the raw protocol identifier",
  }),
  // Icon aria-label.
  iconAria: defineMessage({
    id: "plugin.errorBoundary.iconAria",
    message: "Plugin icon failed to render",
  }),
} satisfies Record<string, MessageDescriptor>;

/**
 * A class because React 19 has no hook for `componentDidCatch`. Labels use the
 * global `i18n._` snapshot, acceptable on a crash report.
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
    // Shown verbatim: a plugin component's exception has no descriptor to map
    // to, so its text is the only diagnostic, shown under a localized heading.
    const message = this.state.error.message;
    const label = pluginLabel ?? i18n._(M.unknownPlugin);

    if (kind === "icon") {
      return (
        <AlertTriangle
          aria-label={i18n._(M.iconAria)}
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
              <p className="font-semibold">{i18n._(M.pageTitle)}</p>
              <p className="mt-1">
                {i18n._(
                  M.pageBody.id,
                  { label },
                  { message: M.pageBody.message },
                )}
              </p>
              <pre className="bg-muted mt-2 overflow-x-auto rounded p-2 font-mono text-xs">
                {message}
              </pre>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    if (kind === "widget") {
      return (
        <Alert variant="destructive" data-testid="plugin-widget__error">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            {i18n._(
              M.widgetBody.id,
              { label },
              { message: M.widgetBody.message },
            )}
          </AlertDescription>
        </Alert>
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
        {i18n._(
          M.inlineStub.id,
          { label, kind },
          { message: M.inlineStub.message },
        )}
      </span>
    );
  }
}
