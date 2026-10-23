import type { LeaseHolder } from "../db/edit-lease.js";
import type {
  EditLeaseApi,
  EditLeaseNotice,
  EditLeaseState,
} from "./edit-lease-session.js";
import { editingElsewhere, etagConflict } from "./conflict.js";
import {
  createEditLeaseSession,
  editorLeaseMode,
  lockedBy,
} from "./edit-lease-session.js";
import { createSaveQueue } from "./save-queue.js";

export interface EditingCopyOptions<
  Id,
  Work,
  Saved,
  Response extends { readonly etag: string },
> {
  readonly id: Id;
  /** The resource's lease procedures: one of core's lease kinds. */
  readonly lease: EditLeaseApi<Id>;
  /** The concurrency token the editor's copy came with. */
  readonly etag: string;
  /** The signed-in user, whose own lease names no one else editing. */
  readonly userId: number;
  /** Write `work` from the copy `etag` names. */
  readonly save: (etag: string, work: Work) => Promise<Response>;
  /** What is saved at `etag`, shaped like the work, for Compare. */
  readonly readSaved: (etag: string) => Promise<Saved>;
  /** Show what is saved now, and resolve with its concurrency token. */
  readonly reload: () => Promise<string>;
  /** A write refused for a reason other than a conflict or the lease, or a
   *  reload that failed. */
  readonly onFailed: (err: unknown) => void;
}

/** A save refused because another write landed since the editor's copy. */
export interface EditingConflict<Work> {
  /** The resource's token now, which Keep mine saves from. */
  readonly etag: string;
  /** When the other write landed; `null` when the resource doesn't record it. */
  readonly changedAt: Date | null;
  /** Another user holding the edit lease, named as editing it now. */
  readonly editingElsewhere: LeaseHolder | undefined;
  /** The refused work, held as it was refused. */
  readonly mine: Work;
}

export interface EditingCopySnapshot<Work, Saved> {
  readonly mode: "loading" | "editable" | "readOnly";
  /** Whether the editor's fields take input. */
  readonly readOnly: boolean;
  /** Why the editor is read-only: another user holds the lease, or took it. */
  readonly banner: EditLeaseNotice | undefined;
  /** Open until the author keeps theirs or loads what is saved now. */
  readonly conflict: EditingConflict<Work> | undefined;
  /** Whether Keep mine can save now: a conflict is open and the lease allows it. */
  readonly canKeepMine: boolean;
  /** What is saved at the conflict's token, for Compare; unset until read. */
  readonly compare: Saved | undefined;
  /** A take over has been asked for and not answered yet. */
  readonly takingOver: boolean;
}

export interface EditingCopyController<Work, Saved, Response> {
  /**
   * Write `work` through the save queue from the current token, adopting the
   * response's token.
   */
  readonly save: (work: Work) => Promise<Response | undefined>;
  /** Save the conflict's held work over what is saved now, from its token. */
  readonly keepMine: () => Promise<Response | undefined>;
  /** Drop the conflict's held work and reload what is saved now. */
  readonly loadTheirs: () => Promise<void>;
  /** Claim the lease another user holds, then reload what is saved now. */
  readonly takeOver: () => Promise<void>;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => EditingCopySnapshot<Work, Saved>;
  readonly dispose: () => void;
}

/** Where every copy starts, and returns to once disposed. */
export const LOADING_EDITING_COPY: EditingCopySnapshot<never, never> = {
  mode: "loading",
  readOnly: true,
  banner: undefined,
  conflict: undefined,
  canKeepMine: false,
  compare: undefined,
  takingOver: false,
};

/**
 * One editor's copy of a resource: its edit lease, its concurrency token, the
 * save queue every write goes through, and the conflict a refused write opens.
 */
export function createEditingCopy<
  Id,
  Work,
  Saved,
  Response extends { readonly etag: string },
>(
  options: EditingCopyOptions<Id, Work, Saved, Response>,
): EditingCopyController<Work, Saved, Response> {
  const listeners = new Set<() => void>();
  let lease: EditLeaseState = { kind: "pending" };
  let snapshot: EditingCopySnapshot<Work, Saved> = LOADING_EDITING_COPY;
  let conflict: EditingConflict<Work> | undefined;
  let saved: { readonly etag: string; readonly value: Saved } | undefined;
  let readFor: string | undefined;
  let takingOver = false;
  let disposed = false;
  let etag = options.etag;
  const queue = createSaveQueue();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const publish = (): void => {
    // Disposed: whatever answers now was about a copy no longer on screen.
    if (disposed) return;
    const leaseMode = editorLeaseMode(lease);
    snapshot = {
      mode: leaseMode.mode,
      readOnly: leaseMode.mode !== "editable" || conflict !== undefined,
      banner: leaseMode.mode === "readOnly" ? leaseMode.notice : undefined,
      conflict,
      canKeepMine: conflict !== undefined && leaseMode.mode === "editable",
      compare:
        conflict && saved?.etag === conflict.etag ? saved.value : undefined,
      takingOver,
    };
    notify();
  };

  const session = createEditLeaseSession({
    id: options.id,
    api: options.lease,
    onChange: (state) => {
      lease = state;
      publish();
    },
  });
  session.start();

  const readSaved = (at: string): void => {
    if (readFor === at) return;
    readFor = at;
    // Unread, Compare shows only the author's side.
    void options.readSaved(at).then(
      (value) => {
        saved = { etag: at, value };
        publish();
      },
      () => undefined,
    );
  };

  const refused = (err: unknown, work: Work): undefined => {
    const locked = lockedBy(err);
    if (locked) {
      session.lose(locked);
      return undefined;
    }
    const stale = etagConflict(err);
    if (!stale) {
      options.onFailed(err);
      return undefined;
    }
    conflict = {
      etag: stale.etag,
      changedAt: stale.updatedAt ?? null,
      editingElsewhere: editingElsewhere(stale, options.userId),
      mine: work,
    };
    publish();
    readSaved(stale.etag);
    return undefined;
  };

  const write = async (
    from: string,
    work: Work,
  ): Promise<Response | undefined> => {
    try {
      const response = await options.save(from, work);
      etag = response.etag;
      return response;
    } catch (err) {
      return refused(err, work);
    }
  };

  const reload = async (): Promise<void> => {
    try {
      etag = await options.reload();
    } catch (err) {
      options.onFailed(err);
    }
  };

  return {
    save: (work) =>
      // Paused while a conflict is open: the author picks first.
      queue.run(() =>
        conflict ? Promise.resolve(undefined) : write(etag, work),
      ),
    keepMine: () => {
      const held = conflict;
      if (!held) return Promise.resolve(undefined);
      conflict = undefined;
      publish();
      return queue.run(() => write(held.etag, held.mine));
    },
    loadTheirs: () => {
      conflict = undefined;
      publish();
      return queue.run(reload);
    },
    takeOver: async () => {
      takingOver = true;
      publish();
      try {
        await session.takeOver();
      } catch (err) {
        options.onFailed(err);
        return;
      } finally {
        takingOver = false;
        publish();
      }
      await queue.run(reload);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    dispose: () => {
      disposed = true;
      session.stop();
      snapshot = LOADING_EDITING_COPY;
      notify();
    },
  };
}
