import type { MessageDescriptor } from "@lingui/core";
import type { ReactElement } from "react";

import type { LeaseHolder } from "../db/edit-lease.js";
import type {
  EditLeaseNotice,
  EditLeaseState,
  LeaseRefusal,
} from "./edit-lease-session.js";

/** How a resource's conflict dialog and lease banner name what is edited. */
export interface EditingCopy {
  readonly conflictTitle: MessageDescriptor;
  /** The conflict's description when it carries no time, if not the default. */
  readonly conflictUntimed?: MessageDescriptor;
  readonly heldBy: MessageDescriptor;
  readonly lost: MessageDescriptor;
}

export interface EditLease {
  readonly state: EditLeaseState;
  readonly takeOver: () => Promise<void>;
  readonly lose: (refusal: LeaseRefusal) => void;
}

export interface EditLeaseBannerProps {
  readonly copy: EditingCopy;
  readonly notice: EditLeaseNotice;
  /** Offered only while another user holds the lease. */
  readonly onTakeOver: () => void;
  readonly isTakingOver: boolean;
  readonly onBack: () => void;
}

export interface EditConflictDialogProps {
  readonly copy: EditingCopy;
  readonly open: boolean;
  /** When the other write landed; `null` when the resource doesn't record it. */
  readonly changedAt: Date | null;
  /** Another user holding the edit lease, named as editing it now. */
  readonly editingElsewhere: LeaseHolder | undefined;
  /** The author's unsaved copy, and the resource as it is saved now. */
  readonly mineSnapshot: unknown;
  readonly theirsSnapshot: unknown;
  readonly onKeepMine: () => void;
  readonly onLoadTheirs: () => void;
}

/** The resources whose edit lease `useEditLease` holds. */
export type EditLeaseKind = "entry" | "user" | "term";

/** What the admin shell publishes for a plugin chunk to edit a resource with. */
export interface AdminEditing {
  /** Holds the resource's edit lease while the calling component is mounted. */
  readonly useEditLease: (kind: EditLeaseKind, id: number) => EditLease;
  readonly EditLeaseBanner: (props: EditLeaseBannerProps) => ReactElement;
  readonly EditConflictDialog: (props: EditConflictDialogProps) => ReactElement;
}
