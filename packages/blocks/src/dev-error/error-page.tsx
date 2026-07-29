import type { ReactElement, ReactNode } from "react";

import type {
  DevErrorContext,
  DevErrorFact,
  DevErrorFrame,
  DevErrorHint,
  DevErrorHydrationDiff,
  DevErrorInfo,
  DevErrorQuery,
  DevErrorTimeline,
  RenderedDevErrorPanel,
} from "./contract.js";
import type { EditorPathMap } from "./editor.js";
import { buildEditorUrl } from "./editor.js";
import {
  commonBaseDir,
  DEV_ERROR_SOURCE_ENDPOINT,
  relativeFramePath,
} from "./frames.js";

/**
 * The shared dev-error renderer (#1580). Theme-independent: it renders the
 * exception header and — when the stack parsed into frames — a stack view with
 * each frame's original `file:line`, application frames expanded and framework
 * frames collapsed behind a toggle, plus an excerpt panel the client
 * enhancement fills by lazy-fetching source from the dev resolver (#1596). It
 * works even when the theme, layout, or document is what threw. The server page
 * (core) SSRs this into a standalone HTML document with the token sheet
 * inlined; the client overlay (#1603) will mount the same component inside a
 * Shadow DOM root.
 */
export function DevErrorPage({
  error,
  context,
  panels,
  editor,
  editorPathMap,
}: {
  readonly error: DevErrorInfo;
  /**
   * The request-scoped context sections (#1598). Present on the server page,
   * absent on the client overlay and the boot-error fallback — the page then
   * shows just the exception, hints, and stack.
   */
  readonly context?: DevErrorContext;
  /**
   * Plugin-contributed panels, already rendered to isolated HTML (#1626).
   * Shown as their own sections below the built-in context. Absent on surfaces
   * with no live app to run the `error_page:panels` filter — the client overlay
   * and the boot-error fallback.
   */
  readonly panels?: readonly RenderedDevErrorPanel[];
  /**
   * The resolved open-in-editor URL template (#1581) — from `PLUMIX_EDITOR`,
   * built by {@link resolveEditorTemplate}. When present, each frame renders an
   * "Open in editor" link built from it; absent (no editor configured) drops the
   * link and leaves the frame as a source-viewing button only.
   */
  readonly editor?: string;
  /**
   * An optional from→to path-prefix remap for the editor links (#1627) — from
   * `PLUMIX_EDITOR_PATH_MAP`, parsed by {@link resolveEditorPathMap}. Applied to
   * each frame's path so links resolve on the editor host when the dev server
   * runs in a container or on a remote box with a different filesystem layout.
   */
  readonly editorPathMap?: EditorPathMap;
}): ReactElement {
  const frames = error.frames ?? [];
  const appFrames = frames.filter((frame) => !frame.isVendor);
  const vendorFrames = frames.filter((frame) => frame.isVendor);
  // Show paths relative to the project root, derived from the frames so the
  // long absolute prefix doesn't dominate every line. Shared with the client
  // enhancement (which relativizes the excerpt header) via `data-base`.
  const base = commonBaseDir(frames);
  const hints = error.hints ?? [];
  // With no frames, fall back to the raw stack — unless the only signal is a
  // component stack (a hydration mismatch, #1667), in which case the
  // "(no stack available)" block is redundant noise above the component-stack
  // section that names the offending island.
  const showStackFallback =
    error.stack !== undefined || error.componentStack === undefined;

  return (
    <div className="plumix-dev-error" data-testid="plumix-dev-error">
      <header className="plumix-dev-error__header">
        <p
          className="plumix-dev-error__name"
          data-testid="plumix-dev-error-name"
        >
          {error.name}
        </p>
        <h1
          className="plumix-dev-error__message"
          data-testid="plumix-dev-error-message"
        >
          {error.message}
        </h1>
      </header>
      {hints.length > 0 ? (
        <section
          className="plumix-dev-error__hints"
          data-testid="plumix-dev-error-hints"
          aria-label="How to fix"
        >
          {hints.map((hint, index) => (
            <HintCard key={hintKey(hint, index)} hint={hint} />
          ))}
        </section>
      ) : null}
      {frames.length > 0 ? (
        <section
          className="plumix-dev-error__frames"
          data-testid="plumix-dev-error-frames"
          data-endpoint={DEV_ERROR_SOURCE_ENDPOINT}
          data-base={base}
        >
          <div className="plumix-dev-error__framelist">
            <ol className="plumix-dev-error__app-frames">
              {appFrames.map((frame, index) => (
                <li key={frameKey(frame, index)}>
                  <FrameButton
                    frame={frame}
                    base={base}
                    editor={editor}
                    editorPathMap={editorPathMap}
                  />
                </li>
              ))}
            </ol>
            {vendorFrames.length > 0 ? (
              <details
                className="plumix-dev-error__vendor"
                data-testid="plumix-dev-error-vendor"
              >
                <summary className="plumix-dev-error__vendor-summary">
                  {vendorFrames.length} framework{" "}
                  {vendorFrames.length === 1 ? "frame" : "frames"}
                </summary>
                <ol className="plumix-dev-error__vendor-frames">
                  {vendorFrames.map((frame, index) => (
                    <li key={frameKey(frame, index)}>
                      <FrameButton
                        frame={frame}
                        base={base}
                        editor={editor}
                        editorPathMap={editorPathMap}
                      />
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </div>
          <div
            className="plumix-dev-error__source"
            data-testid="plumix-dev-error-source"
            aria-live="polite"
          >
            <p className="plumix-dev-error__source-empty">
              Select a frame to view its source.
            </p>
          </div>
        </section>
      ) : showStackFallback ? (
        <section
          className="plumix-dev-error__stack"
          data-testid="plumix-dev-error-stack"
        >
          <pre>
            <code>{error.stack ?? "(no stack available)"}</code>
          </pre>
        </section>
      ) : null}
      {error.hydrationDiff ? (
        <HydrationDiff diff={error.hydrationDiff} />
      ) : null}
      {error.componentStack && frames.length === 0 ? (
        // Resolved frames already point at the failing component, so the raw
        // React component stack is only useful as a fallback when none resolved.
        // It sits below the hydration diff (#1668) — the diff shows *what*
        // diverged and is the actionable signal; the stack is the fallback.
        <section
          className="plumix-dev-error__component-stack"
          data-testid="plumix-dev-error-component-stack"
          aria-label="Component stack"
        >
          <h2 className="plumix-dev-error__section-title">Component stack</h2>
          <pre className="plumix-dev-error__component-stack-pre">
            <code>{error.componentStack}</code>
          </pre>
        </section>
      ) : null}
      {context ? <ContextSections context={context} /> : null}
      {panels && panels.length > 0 ? <PanelSections panels={panels} /> : null}
    </div>
  );
}

/**
 * The server-vs-client render pair for a hydration mismatch (#1668). Shows the
 * island's captured markup before `hydrateRoot` against its markup after React's
 * recovery re-render, so the developer sees *what* diverged, not just that it
 * did. Both strings are the island's own HTML, rendered as React-escaped text —
 * never re-parsed — so a diverging `<script>` can't run inside the overlay.
 */
function HydrationDiff({
  diff,
}: {
  readonly diff: DevErrorHydrationDiff;
}): ReactElement {
  return (
    <section
      className="plumix-dev-error__section plumix-dev-error__hydration-diff"
      data-testid="plumix-dev-error-hydration-diff"
      aria-label="Hydration diff"
    >
      <h2 className="plumix-dev-error__section-title">Hydration diff</h2>
      <div className="plumix-dev-error__hydration-panes">
        <div
          className="plumix-dev-error__hydration-pane"
          data-testid="plumix-dev-error-hydration-server"
        >
          <h3 className="plumix-dev-error__subhead">Server (SSR)</h3>
          <pre className="plumix-dev-error__hydration-pre">
            <code>{diff.server}</code>
          </pre>
        </div>
        <div
          className="plumix-dev-error__hydration-pane"
          data-testid="plumix-dev-error-hydration-client"
        >
          <h3 className="plumix-dev-error__subhead">Client (recovered)</h3>
          <pre className="plumix-dev-error__hydration-pre">
            <code>{diff.client}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}

/**
 * The plugin-contributed panels (#1626), each rendered in its own section below
 * the built-in context. The HTML is the plugin's own isolated SSR output —
 * core renders it panel-by-panel so a throw yields a fallback rather than
 * crashing this page — and is inlined verbatim; only the plugin-supplied
 * {@link RenderedDevErrorPanel.title} is React-escaped as text.
 */
function PanelSections({
  panels,
}: {
  readonly panels: readonly RenderedDevErrorPanel[];
}): ReactElement {
  return (
    <div
      className="plumix-dev-error__panels"
      data-testid="plumix-dev-error-panels"
    >
      {panels.map((panel) => (
        <section
          key={panel.id}
          className="plumix-dev-error__section"
          data-testid={`plumix-dev-error-panel-${panel.id}`}
          aria-label={panel.title}
        >
          <h2 className="plumix-dev-error__section-title">{panel.title}</h2>
          <div dangerouslySetInnerHTML={{ __html: panel.html }} />
        </section>
      ))}
    </div>
  );
}

/**
 * The request-scoped context, read from the same collectors the debug bar uses
 * but rendered by this page's own sections — the debug bar is never shown here.
 * Each section degrades on its own: the request always has a method and URL, so
 * it always renders; the data-driven ones show an explicit empty note when
 * their collector recorded nothing.
 */
function ContextSections({
  context,
}: {
  readonly context: DevErrorContext;
}): ReactElement {
  return (
    <div className="plumix-dev-error__context">
      <RequestSection context={context} />
      <RouteSection context={context} />
      <DatabaseSection queries={context.queries} />
      <TimelineSection timeline={context.timeline} />
      <ContextSection id="app" title="Application">
        <FactList facts={context.app} />
      </ContextSection>
    </div>
  );
}

function RequestSection({
  context,
}: {
  readonly context: DevErrorContext;
}): ReactElement {
  const { request } = context;
  return (
    <ContextSection id="request" title="Request">
      <FactList
        facts={[
          { label: "Method", value: request.method },
          { label: "URL", value: request.url },
        ]}
      />
      {request.headers.length > 0 ? (
        <>
          <h3 className="plumix-dev-error__subhead">Headers</h3>
          <FactList facts={request.headers} />
        </>
      ) : null}
    </ContextSection>
  );
}

function RouteSection({
  context,
}: {
  readonly context: DevErrorContext;
}): ReactElement {
  const { entity, template } = context.route;
  if (entity === undefined && template === undefined) {
    return (
      <ContextSection id="route" title="Route">
        <EmptyNote>No route resolved.</EmptyNote>
      </ContextSection>
    );
  }
  return (
    <ContextSection id="route" title="Route">
      <FactList
        facts={[
          { label: "Entity", value: entity ?? "—" },
          { label: "Template", value: template ?? "—" },
        ]}
      />
    </ContextSection>
  );
}

function DatabaseSection({
  queries,
}: {
  readonly queries: readonly DevErrorQuery[];
}): ReactElement {
  return (
    <ContextSection
      id="database"
      title={
        queries.length > 0
          ? `Database — ${queries.length} ${queries.length === 1 ? "query" : "queries"}`
          : "Database"
      }
    >
      {queries.length === 0 ? (
        <EmptyNote>No queries recorded.</EmptyNote>
      ) : (
        <>
          <ol className="plumix-dev-error__queries">
            {queries.map((query, index) => (
              <li
                key={`${index}:${query.sql}`}
                className={queryClassName(query)}
              >
                <code className="plumix-dev-error__sql">{query.sql}</code>
                <span className="plumix-dev-error__query-meta">
                  {query.failed ? (
                    <span
                      className="plumix-dev-error__badge"
                      data-testid="plumix-dev-error-query-failed"
                    >
                      failed
                    </span>
                  ) : null}
                  {query.batchFailed ? (
                    <span
                      className="plumix-dev-error__badge plumix-dev-error__badge--muted"
                      data-testid="plumix-dev-error-query-batch-failed"
                    >
                      batch failed
                    </span>
                  ) : null}
                  {query.durationMs !== undefined ? (
                    <span className="plumix-dev-error__query-ms">
                      {query.durationMs}ms
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          {queries.some((query) => query.batchFailed) ? (
            <p
              className="plumix-dev-error__query-note"
              data-testid="plumix-dev-error-batch-note"
            >
              One statement in this batch threw and rolled back the whole group.
              A batch is one atomic round-trip, so the driver does not report
              which statement it was.
            </p>
          ) : null}
        </>
      )}
    </ContextSection>
  );
}

function queryClassName(query: DevErrorQuery): string {
  if (query.failed) {
    return "plumix-dev-error__query plumix-dev-error__query--failed";
  }
  if (query.batchFailed) {
    return "plumix-dev-error__query plumix-dev-error__query--batch-failed";
  }
  return "plumix-dev-error__query";
}

function TimelineSection({
  timeline,
}: {
  readonly timeline: DevErrorTimeline;
}): ReactElement {
  if (timeline.rows.length === 0) {
    return (
      <ContextSection id="timeline" title="Timeline">
        <EmptyNote>No spans recorded.</EmptyNote>
      </ContextSection>
    );
  }
  // Guard against a zero window so the bar math never divides by zero.
  const total = timeline.totalMs || 1;
  return (
    <ContextSection id="timeline" title={`Timeline — ${timeline.totalMs}ms`}>
      <ol className="plumix-dev-error__spans">
        {timeline.rows.map((row, index) => (
          <li
            key={`${index}:${row.name}`}
            className={
              row.failed
                ? "plumix-dev-error__span plumix-dev-error__span--failed"
                : "plumix-dev-error__span"
            }
          >
            <span
              className="plumix-dev-error__span-name"
              style={{ paddingLeft: `${row.depth * 0.75}rem` }}
            >
              {row.name}
            </span>
            <span className="plumix-dev-error__span-track">
              <span
                className="plumix-dev-error__span-bar"
                style={{
                  marginLeft: `${(row.offsetMs / total) * 100}%`,
                  width: `${Math.max((row.durationMs / total) * 100, 1)}%`,
                }}
              />
            </span>
            <span className="plumix-dev-error__span-ms">
              {row.durationMs}ms
            </span>
          </li>
        ))}
      </ol>
    </ContextSection>
  );
}

function ContextSection({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section
      className="plumix-dev-error__section"
      data-testid={`plumix-dev-error-${id}`}
      aria-label={title}
    >
      <h2 className="plumix-dev-error__section-title">{title}</h2>
      {children}
    </section>
  );
}

function FactList({
  facts,
}: {
  readonly facts: readonly DevErrorFact[];
}): ReactElement {
  return (
    <dl className="plumix-dev-error__facts">
      {facts.map((fact, index) => (
        <div key={`${index}:${fact.label}`} className="plumix-dev-error__fact">
          <dt className="plumix-dev-error__fact-label">{fact.label}</dt>
          <dd className="plumix-dev-error__fact-value">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyNote({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return <p className="plumix-dev-error__empty">{children}</p>;
}

function HintCard({ hint }: { readonly hint: DevErrorHint }): ReactElement {
  const docs = hint.docs ?? [];
  return (
    <div className="plumix-dev-error__hint" data-testid="plumix-dev-error-hint">
      <p className="plumix-dev-error__hint-title">{hint.title}</p>
      {hint.body !== undefined ? (
        <p className="plumix-dev-error__hint-body">{hint.body}</p>
      ) : null}
      {docs.length > 0 ? (
        <ul className="plumix-dev-error__hint-docs">
          {docs.map((doc) => (
            <li key={doc.href}>
              <a
                className="plumix-dev-error__hint-doc"
                href={doc.href}
                target="_blank"
                rel="noreferrer"
              >
                {doc.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FrameButton({
  frame,
  base,
  editor,
  editorPathMap,
}: {
  readonly frame: DevErrorFrame;
  readonly base: string;
  /** The resolved open-in-editor template; when set, renders the editor link. */
  readonly editor?: string;
  /** The optional from→to path remap applied to the frame path (#1627). */
  readonly editorPathMap?: EditorPathMap;
}): ReactElement {
  const location = `${relativeFramePath(frame.file, base)}:${frame.line}`;
  return (
    <div className="plumix-dev-error__frame-row">
      <button
        type="button"
        className="plumix-dev-error__frame"
        data-plumix-frame=""
        data-file={frame.file}
        data-line={String(frame.line)}
        data-testid="plumix-dev-error-frame"
      >
        <span className="plumix-dev-error__frame-fn">
          {frame.functionName ?? "(anonymous)"}
        </span>
        <span className="plumix-dev-error__frame-loc">{location}</span>
      </button>
      {editor !== undefined ? (
        // A plain anchor to the editor's URL scheme — zero-JS, no round-trip
        // (#1581). The OS hands the `scheme://…` URL to the configured editor.
        <a
          className="plumix-dev-error__open"
          href={buildEditorUrl(editor, frame, editorPathMap)}
          data-testid="plumix-dev-error-open"
          aria-label={`Open ${location} in your editor`}
          title="Open in editor"
        >
          <svg
            className="plumix-dev-error__open-icon"
            viewBox="0 0 16 16"
            width="16"
            height="16"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M6.5 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-3M9.5 2.5H14V7M13.5 2.5 7 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      ) : null}
    </div>
  );
}

function frameKey(frame: DevErrorFrame, index: number): string {
  return `${index}:${frame.file}:${frame.line}`;
}

function hintKey(hint: DevErrorHint, index: number): string {
  return `${index}:${hint.title}`;
}
