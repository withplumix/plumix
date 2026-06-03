import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { Component } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { i18n } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";
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
  // Inline stub for blocks / field renderers — `{kind}` is the
  // protocol discriminator (block / field) verbatim. Localizing it
  // would require a kind→noun map; keep raw for now (same policy
  // as other protocol identifiers).
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
 * Catch render errors in plugin-supplied components so a third-party
 * bug doesn't take down the surrounding admin shell. Each kind picks
 * a fallback shape that fits its host context: pages get a full-card
 * alert, icons get a tiny warning glyph, blocks/fields get inline
 * stubs.
 *
 * Class component because React error boundaries still require it
 * (no hook equivalent for `componentDidCatch` as of React 19). Label
 * resolution goes through `@lingui/core`'s global `i18n._` — same
 * locale-snapshot constraint that applies to every non-React lingui
 * consumer in admin; acceptable here because the user is already
 * looking at a crash report.
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
