import { ORPCError } from "@orpc/client";
import * as v from "valibot";

import { EDIT_LEASE_RENEW_INTERVAL_MS } from "@plumix/core/admin";

export interface LeaseHolder {
  readonly id: number;
  readonly name: string;
}

/** Where this editor stands with the entry's edit lease. */
export type EditLeaseState =
  | { readonly kind: "pending" }
  | { readonly kind: "held" }
  /** Asking failed for a reason other than another holder. */
  | { readonly kind: "unleased" }
  | {
      readonly kind: "heldByOther";
      readonly holder: LeaseHolder;
      readonly since: Date;
    }
  | { readonly kind: "lost"; readonly by: LeaseHolder; readonly at: Date };

export type EditLeaseNotice =
  | {
      readonly kind: "heldByOther";
      readonly name: string;
      readonly since: Date;
    }
  | { readonly kind: "lost"; readonly name: string; readonly at: Date };

export type EditorLeaseMode =
  | { readonly mode: "loading" }
  | { readonly mode: "editable" }
  | { readonly mode: "readOnly"; readonly notice: EditLeaseNotice };

export function editorLeaseMode(state: EditLeaseState): EditorLeaseMode {
  switch (state.kind) {
    case "pending":
      return { mode: "loading" };
    case "held":
    case "unleased":
      return { mode: "editable" };
    case "heldByOther":
      return {
        mode: "readOnly",
        notice: {
          kind: "heldByOther",
          name: state.holder.name,
          since: state.since,
        },
      };
    case "lost":
      return {
        mode: "readOnly",
        notice: { kind: "lost", name: state.by.name, at: state.at },
      };
  }
}

const lockedData = v.object({
  holder: v.object({ id: v.number(), name: v.string() }),
  since: v.date(),
});

/** A write or acquire refused because `holder` has held the lease since `since`. */
export interface LeaseRefusal {
  readonly holder: LeaseHolder;
  readonly since: Date;
}

/** The refusal a `LOCKED` error carries; `undefined` for any other error. */
export function lockedBy(err: unknown): LeaseRefusal | undefined {
  if (!(err instanceof ORPCError) || err.code !== "LOCKED") return undefined;
  const parsed = v.safeParse(lockedData, err.data);
  return parsed.success ? parsed.output : undefined;
}

interface LeaseView {
  readonly holder: LeaseHolder;
  readonly since: Date;
}

/** The `entry.lease` procedures the session calls. */
export interface EditLeaseApi {
  readonly acquire: (input: {
    readonly id: number;
    readonly takeOver?: boolean;
  }) => Promise<LeaseView>;
  readonly renew: (input: {
    readonly id: number;
  }) => Promise<
    | { readonly lease: LeaseView }
    | { readonly lost: { readonly by: LeaseHolder; readonly at: Date } }
  >;
  readonly release: (input: { readonly id: number }) => Promise<void>;
}

export interface EditLeaseSession {
  readonly start: () => void;
  /** Replace whoever holds the lease; rejects when the request fails. */
  readonly takeOver: () => Promise<void>;
  /** A save was refused because `holder` holds the lease now. */
  readonly lose: (refusal: LeaseRefusal) => void;
  readonly stop: () => void;
}

export function createEditLeaseSession(options: {
  readonly id: number;
  readonly api: EditLeaseApi;
  readonly onChange: (state: EditLeaseState) => void;
}): EditLeaseSession {
  const { id, api, onChange } = options;
  let renewals: ReturnType<typeof setInterval> | undefined;
  let held = false;
  let stopped = false;

  const stopRenewing = (): void => {
    clearInterval(renewals);
    renewals = undefined;
    held = false;
  };
  const report = (state: EditLeaseState): void => {
    if (!stopped) onChange(state);
  };
  const lose = (by: LeaseHolder, at: Date): void => {
    stopRenewing();
    report({ kind: "lost", by, at });
  };
  const renew = (): void => {
    // A failed renewal is retried on the next tick; the lease outlasts a few.
    void api.renew({ id }).then(
      (renewal) => {
        if ("lost" in renewal) lose(renewal.lost.by, renewal.lost.at);
      },
      () => undefined,
    );
  };
  const release = (): void => {
    // Best-effort: a lease nobody releases lapses on its own.
    void api.release({ id }).catch(() => undefined);
  };
  const hold = (): void => {
    if (stopped) {
      release();
      return;
    }
    stopRenewing();
    held = true;
    renewals = setInterval(renew, EDIT_LEASE_RENEW_INTERVAL_MS);
    report({ kind: "held" });
  };

  return {
    start: () => {
      void api.acquire({ id }).then(hold, (err: unknown) => {
        const locked = lockedBy(err);
        report(
          locked ? { kind: "heldByOther", ...locked } : { kind: "unleased" },
        );
      });
    },
    takeOver: () => api.acquire({ id, takeOver: true }).then(hold),
    lose: ({ holder, since }) => lose(holder, since),
    stop: () => {
      const wasHeld = held;
      stopRenewing();
      stopped = true;
      if (wasHeld) release();
    },
  };
}
