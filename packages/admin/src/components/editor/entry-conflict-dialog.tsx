import type { PostEditorValues } from "@/components/editor/entry-editor-form.js";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
import { Button } from "@/components/ui/button.js";

import type { Entry } from "@plumix/core/schema";

interface EntryConflictDialogProps {
  readonly open: boolean;
  readonly singularLabel: string;
  readonly mine: PostEditorValues | null;
  readonly theirs: Entry | null;
  readonly onKeepMine: () => void;
  readonly onTakeTheirs: () => void;
  readonly onOpenChange: (open: boolean) => void;
}

export function EntryConflictDialog({
  open,
  singularLabel,
  mine,
  theirs,
  onKeepMine,
  onTakeTheirs,
  onOpenChange,
}: EntryConflictDialogProps): ReactNode {
  const [showCompare, setShowCompare] = useState(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setShowCompare(false);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        className={showCompare ? "max-w-3xl" : undefined}
        data-testid="entry-editor-conflict-dialog"
      >
        {!showCompare ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Someone else updated this {singularLabel}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Your version is out of date. Keep your changes, take the
                latest, or compare side-by-side first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-col">
              <Button
                data-testid="entry-editor-conflict-keep-mine"
                onClick={onKeepMine}
              >
                Keep my changes
              </Button>
              <Button
                data-testid="entry-editor-conflict-take-theirs"
                variant="secondary"
                onClick={onTakeTheirs}
              >
                Discard and reload
              </Button>
              <Button
                data-testid="entry-editor-conflict-compare"
                variant="ghost"
                onClick={() => setShowCompare(true)}
              >
                Compare side-by-side
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Compare your changes vs the live {singularLabel}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Pick which version to keep.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2 text-sm">
              <ComparePanel
                title="Your changes"
                testIdPrefix="entry-editor-conflict-mine"
                values={mine}
              />
              <ComparePanel
                title="Live version"
                testIdPrefix="entry-editor-conflict-theirs"
                values={theirs ? entryToCompareValues(theirs) : null}
              />
            </div>
            <AlertDialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowCompare(false)}
                data-testid="entry-editor-conflict-back"
              >
                Back
              </Button>
              <Button
                data-testid="entry-editor-conflict-keep-mine"
                onClick={onKeepMine}
              >
                Keep mine
              </Button>
              <Button
                data-testid="entry-editor-conflict-take-theirs"
                variant="secondary"
                onClick={onTakeTheirs}
              >
                Take theirs
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface CompareValues {
  readonly title: string;
  readonly slug: string;
  readonly status: string;
  readonly excerpt: string;
}

function ComparePanel({
  title,
  testIdPrefix,
  values,
}: {
  readonly title: string;
  readonly testIdPrefix: string;
  readonly values: CompareValues | null;
}): ReactNode {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
        {title}
      </h3>
      {values === null ? (
        <p className="text-muted-foreground italic">Loading…</p>
      ) : (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5">
          <CompareRow label="Title" testId={`${testIdPrefix}-title`}>
            {values.title}
          </CompareRow>
          <CompareRow label="Slug" testId={`${testIdPrefix}-slug`}>
            {values.slug}
          </CompareRow>
          <CompareRow label="Status" testId={`${testIdPrefix}-status`}>
            {values.status}
          </CompareRow>
          <CompareRow label="Excerpt" testId={`${testIdPrefix}-excerpt`}>
            {values.excerpt.length === 0 ? "—" : values.excerpt}
          </CompareRow>
        </dl>
      )}
    </section>
  );
}

function CompareRow({
  label,
  testId,
  children,
}: {
  readonly label: string;
  readonly testId: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words" data-testid={testId}>
        {children}
      </dd>
    </>
  );
}

function entryToCompareValues(entry: Entry): CompareValues {
  return {
    title: entry.title,
    slug: entry.slug,
    status: entry.status,
    excerpt: entry.excerpt ?? "",
  };
}
