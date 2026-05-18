import type { ReactElement } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.js";

import type { TextDiffSegment } from "./diff.js";
import { diffJson, diffText, extractPlainText } from "./diff.js";

interface RevisionDiffSnapshot {
  readonly title: string;
  readonly slug: string;
  readonly excerpt: string | null;
  readonly content: unknown;
  readonly meta: Readonly<Record<string, unknown>>;
}

export interface RevisionDiffPanelProps {
  readonly revision: RevisionDiffSnapshot;
  readonly current: RevisionDiffSnapshot;
  /** Initial active tab. Exposed for tests + deep-linking. */
  readonly defaultTab?: "visual" | "json";
}

export function RevisionDiffPanel({
  revision,
  current,
  defaultTab = "visual",
}: RevisionDiffPanelProps): ReactElement {
  const visualBody = diffText(
    extractPlainText(revision.content),
    extractPlainText(current.content),
  );
  const jsonResult = diffJson(revision, current);

  return (
    <div data-plumix-revision-diff="" className="space-y-4 px-1 py-3">
      <FieldDiff label="Title" a={revision.title} b={current.title} />
      <FieldDiff label="Slug" a={revision.slug} b={current.slug} />
      <FieldDiff
        label="Excerpt"
        a={revision.excerpt ?? ""}
        b={current.excerpt ?? ""}
      />

      <Tabs defaultValue={defaultTab} className="gap-3">
        <TabsList data-testid="revision-diff-tabs">
          <TabsTrigger value="visual" data-testid="revision-diff-tab-visual">
            Visual
          </TabsTrigger>
          <TabsTrigger value="json" data-testid="revision-diff-tab-json">
            Raw JSON
          </TabsTrigger>
        </TabsList>
        <TabsContent value="visual" data-testid="revision-diff-pane-visual">
          <DiffBody segments={visualBody} />
        </TabsContent>
        <TabsContent value="json" data-testid="revision-diff-pane-json">
          <pre className="bg-muted/40 max-h-96 overflow-auto rounded-md border p-3 text-xs">
            {JSON.stringify(jsonResult.delta ?? {}, null, 2)}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface FieldDiffProps {
  readonly label: string;
  readonly a: string;
  readonly b: string;
}

function FieldDiff({ label, a, b }: FieldDiffProps): ReactElement | null {
  if (a === b) return null;
  return (
    <div
      data-plumix-revision-diff-field={label.toLowerCase()}
      data-testid={`revision-diff-field-${label.toLowerCase()}`}
      className="space-y-1"
    >
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </div>
      <DiffBody segments={diffText(a, b)} />
    </div>
  );
}

function DiffBody({
  segments,
}: {
  readonly segments: readonly TextDiffSegment[];
}): ReactElement {
  const hasChange = segments.some((s) => s.kind !== "equal");
  if (!hasChange) {
    return (
      <p
        data-testid="revision-diff-empty"
        className="text-muted-foreground text-sm"
      >
        No changes.
      </p>
    );
  }
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
      {segments.map((seg, i) => {
        if (seg.kind === "equal") return <span key={i}>{seg.text}</span>;
        if (seg.kind === "insert") {
          return (
            <span
              key={i}
              className="rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            >
              {seg.text}
            </span>
          );
        }
        return (
          <span
            key={i}
            className="rounded bg-rose-500/15 text-rose-700 line-through dark:text-rose-300"
          >
            {seg.text}
          </span>
        );
      })}
    </p>
  );
}
