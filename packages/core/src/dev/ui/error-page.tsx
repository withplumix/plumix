/// <reference lib="dom" />
import type { ReactElement, ReactNode } from "react";

import type {
  DevErrorContext,
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
import {
  DevErrorEmptyNote,
  DevErrorFacts,
  DevErrorSubhead,
} from "./panel-primitives.js";

/**
 * Theme-independent, so it renders even when the theme, layout, or document
 * threw. The client overlays compose `DevErrorBody` instead, since the
 * server-only sections have no data there.
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
   * Already rendered to isolated HTML. Absent where no live app runs the
   * `error_page:panels` filter: the client overlay and the boot fallback.
   */
  readonly panels?: readonly RenderedDevErrorPanel[];
  /** Without it, frames render no "Open in editor" link. */
  readonly editor?: string;
  readonly editorPathMap?: EditorPathMap;
}): ReactElement {
  return (
    <div className="plumix-dev-error" data-testid="plumix-dev-error">
      <DevErrorContent
        error={error}
        editor={editor}
        editorPathMap={editorPathMap}
      />
      {context ? <ContextSections context={context} /> : null}
      {panels && panels.length > 0 ? <PanelSections panels={panels} /> : null}
    </div>
  );
}

export function DevErrorBody({
  error,
}: {
  readonly error: DevErrorInfo;
}): ReactElement {
  return (
    <div className="plumix-dev-error" data-testid="plumix-dev-error">
      <DevErrorContent error={error} />
    </div>
  );
}

/**
 * Returns the nodes without the outer `.plumix-dev-error` element so the page
 * can place its context and panel sections as siblings inside that wrapper.
 */
function DevErrorContent({
  error,
  editor,
  editorPathMap,
}: {
  readonly error: DevErrorInfo;
  readonly editor?: string;
  readonly editorPathMap?: EditorPathMap;
}): ReactElement {
  const frames = error.frames ?? [];
  const appFrames = frames.filter((frame) => !frame.isVendor);
  const vendorFrames = frames.filter((frame) => frame.isVendor);
  // Shared with the client enhancement, which relativizes the excerpt header,
  // via `data-base`.
  const base = commonBaseDir(frames);
  const hints = error.hints ?? [];
  // When the only signal is a component stack (a hydration mismatch), the
  // "(no stack available)" block is noise above the section naming the island.
  const showStackFallback =
    error.stack !== undefined || error.componentStack === undefined;

  return (
    <>
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
        // component stack is only a fallback.
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
    </>
  );
}

/**
 * Rendered as React-escaped text, never re-parsed, so a diverging `<script>`
 * can't run inside the overlay.
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
          <DevErrorSubhead>Server (SSR)</DevErrorSubhead>
          <pre className="plumix-dev-error__hydration-pre">
            <code>{diff.server}</code>
          </pre>
        </div>
        <div
          className="plumix-dev-error__hydration-pane"
          data-testid="plumix-dev-error-hydration-client"
        >
          <DevErrorSubhead>Client (recovered)</DevErrorSubhead>
          <pre className="plumix-dev-error__hydration-pre">
            <code>{diff.client}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}

/**
 * The panel HTML is inlined verbatim; only the plugin-supplied title is
 * React-escaped.
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
 * The request section always renders, since a request always has a method and
 * URL; the others show an explicit empty note.
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
        <DevErrorFacts facts={context.app} />
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
      <DevErrorFacts
        facts={[
          { label: "Method", value: request.method },
          { label: "URL", value: request.url },
        ]}
      />
      {request.headers.length > 0 ? (
        <>
          <DevErrorSubhead>Headers</DevErrorSubhead>
          <DevErrorFacts facts={request.headers} />
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
        <DevErrorEmptyNote>No route resolved.</DevErrorEmptyNote>
      </ContextSection>
    );
  }
  return (
    <ContextSection id="route" title="Route">
      <DevErrorFacts
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
        <DevErrorEmptyNote>No queries recorded.</DevErrorEmptyNote>
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
        <DevErrorEmptyNote>No spans recorded.</DevErrorEmptyNote>
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
  readonly editor?: string;
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
