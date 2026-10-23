import type { ReactElement } from "react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { EditConflictDialog } from "@/editor/EditConflictDialog.js";
import { EditLeaseBanner } from "@/editor/EditLeaseBanner.js";
import { EDIT_LEASE_APIS } from "@/editor/use-edit-lease.js";

import type {
  EditingCopy,
  EditingCopyController,
  EditingCopySnapshot,
  EditLeaseKind,
} from "@plumix/core/admin";
import { createEditingCopy, LOADING_EDITING_COPY } from "@plumix/core/admin";

export interface EditingCopyOptions<Work, Saved, Response> {
  readonly kind: EditLeaseKind;
  readonly id: number;
  /** The concurrency token the editor's copy came with. */
  readonly etag: string;
  /** The signed-in user, whose own lease names no one else editing. */
  readonly userId: number;
  readonly copy: EditingCopy;
  /** Write `work` from the copy `etag` names. */
  readonly save: (etag: string, work: Work) => Promise<Response>;
  /** What is saved at `etag`, shaped like the work, for Compare. */
  readonly readSaved: (etag: string) => Promise<Saved>;
  /** Show what is saved now, and resolve with its concurrency token. */
  readonly reload: () => Promise<string>;
  /** A save refused for another reason, or a reload that failed. */
  readonly onFailed: (err: unknown) => void;
  readonly onBack: () => void;
}

export interface EditingCopyState<Work, Response> {
  readonly mode: EditingCopySnapshot<Work, unknown>["mode"];
  /** Whether the editor's fields refuse input. */
  readonly readOnly: boolean;
  readonly save: (work: Work) => Promise<Response | undefined>;
  /** The lease banner, for the editor to place; `null` while it has none. */
  readonly banner: ReactElement | null;
  /** The conflict dialog, for the editor to place. */
  readonly dialog: ReactElement;
}

function noSubscription(): () => void {
  return () => undefined;
}

function loadingSnapshot(): EditingCopySnapshot<never, never> {
  return LOADING_EDITING_COPY;
}

/**
 * Wires core's editing-copy controller to React for one editor: the controller
 * holds every rule, and a new one is made for each resource.
 */
export function useEditingCopy<
  Work,
  Saved,
  Response extends { readonly etag: string },
>(
  options: EditingCopyOptions<Work, Saved, Response>,
): EditingCopyState<Work, Response> {
  const { kind, id } = options;
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const [controller, setController] = useState<EditingCopyController<
    Work,
    Saved,
    Response
  > | null>(null);
  useEffect(() => {
    const opened = createEditingCopy<number, Work, Saved, Response>({
      id,
      lease: EDIT_LEASE_APIS[kind],
      etag: latest.current.etag,
      userId: latest.current.userId,
      save: (etag, work) => latest.current.save(etag, work),
      readSaved: (etag) => latest.current.readSaved(etag),
      reload: () => latest.current.reload(),
      onFailed: (err) => {
        latest.current.onFailed(err);
      },
    });
    setController(opened);
    return () => {
      opened.dispose();
    };
  }, [kind, id]);
  const snapshot = useSyncExternalStore<EditingCopySnapshot<Work, Saved>>(
    controller?.subscribe ?? noSubscription,
    controller?.getSnapshot ?? loadingSnapshot,
  );
  const { conflict } = snapshot;

  return {
    mode: snapshot.mode,
    readOnly: snapshot.readOnly,
    save: (work) => controller?.save(work) ?? Promise.resolve(undefined),
    banner: snapshot.banner ? (
      <EditLeaseBanner
        copy={options.copy}
        notice={snapshot.banner}
        onTakeOver={() => void controller?.takeOver()}
        isTakingOver={snapshot.takingOver}
        onBack={options.onBack}
      />
    ) : null,
    dialog: (
      <EditConflictDialog
        copy={options.copy}
        open={conflict !== undefined}
        changedAt={conflict?.changedAt ?? null}
        editingElsewhere={conflict?.editingElsewhere}
        mineSnapshot={conflict?.mine ?? null}
        theirsSnapshot={snapshot.compare ?? null}
        keepMineDisabled={!snapshot.canKeepMine}
        onKeepMine={() => void controller?.keepMine()}
        onLoadTheirs={() => void controller?.loadTheirs()}
      />
    ),
  };
}
