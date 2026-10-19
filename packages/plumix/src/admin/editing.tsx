import type { ReactElement } from "react";

import type {
  AdminEditing,
  EditConflictDialogProps,
  EditLease,
  EditLeaseBannerProps,
  EditLeaseKind,
} from "@plumix/core/admin";

import { AdminRuntimeError } from "../errors.js";
import { plumixGlobal } from "./runtime.js";

function adminEditing(): AdminEditing {
  const editing = plumixGlobal()?.editing;
  if (!editing) {
    throw AdminRuntimeError.notInitialised();
  }
  return editing;
}

/**
 * Holds the resource's edit lease through core's lease RPC while the calling
 * component is mounted, renewing it and releasing it on unmount.
 */
export function useEditLease(kind: EditLeaseKind, id: number): EditLease {
  return adminEditing().useEditLease(kind, id);
}

/** The admin's read-only notice naming who else is editing the resource. */
export function EditLeaseBanner(props: EditLeaseBannerProps): ReactElement {
  const Banner = adminEditing().EditLeaseBanner;
  return <Banner {...props} />;
}

/**
 * The admin's dialog for a save refused as stale: compare, keep mine or load
 * theirs.
 */
export function EditConflictDialog(
  props: EditConflictDialogProps,
): ReactElement {
  const Dialog = adminEditing().EditConflictDialog;
  return <Dialog {...props} />;
}
