import type { MessageDescriptor } from "@lingui/core";

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
