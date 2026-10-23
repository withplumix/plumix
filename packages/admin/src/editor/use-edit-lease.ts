import { useCallback, useEffect, useRef, useState } from "react";
import { orpc } from "@/lib/orpc.js";

import type {
  EditLease,
  EditLeaseApi,
  EditLeaseSession,
  EditLeaseState,
  LeaseRefusal,
} from "@plumix/core/admin";
import { createEditLeaseSession } from "@plumix/core/admin";

const ENTRY_LEASE_API: EditLeaseApi = {
  acquire: (input) => orpc.entry.lease.acquire.call(input),
  renew: (input) => orpc.entry.lease.renew.call(input),
  release: (input) => orpc.entry.lease.release.call(input),
};

const USER_LEASE_API: EditLeaseApi = {
  acquire: (input) => orpc.user.lease.acquire.call(input),
  renew: (input) => orpc.user.lease.renew.call(input),
  release: (input) => orpc.user.lease.release.call(input),
};

const TERM_LEASE_API: EditLeaseApi = {
  acquire: (input) => orpc.term.lease.acquire.call(input),
  renew: (input) => orpc.term.lease.renew.call(input),
  release: (input) => orpc.term.lease.release.call(input),
};

const SETTINGS_GROUP_LEASE_API: EditLeaseApi<string> = {
  acquire: ({ id, takeOver }) =>
    orpc.settings.lease.acquire.call({ group: id, takeOver }),
  renew: ({ id }) => orpc.settings.lease.renew.call({ group: id }),
  release: ({ id }) => orpc.settings.lease.release.call({ group: id }),
};

/**
 * Holds the resource's edit lease while `active`; going inactive releases it
 * and forgets where the editor stood.
 */
function useLease<Id>(
  id: Id,
  api: EditLeaseApi<Id>,
  active: boolean,
): EditLease {
  const [state, setState] = useState<EditLeaseState>({ kind: "pending" });
  const session = useRef<EditLeaseSession | null>(null);
  useEffect(() => {
    if (!active) return;
    const current = createEditLeaseSession({ id, api, onChange: setState });
    session.current = current;
    current.start();
    return () => {
      current.stop();
      session.current = null;
      setState({ kind: "pending" });
    };
  }, [id, api, active]);
  const takeOver = useCallback(
    () => session.current?.takeOver() ?? Promise.resolve(),
    [],
  );
  const lose = useCallback(
    (refusal: LeaseRefusal) => session.current?.lose(refusal),
    [],
  );
  return { state, takeOver, lose };
}

/** Core's lease procedures for each resource an editor holds a lease on. */
export const EDIT_LEASE_APIS = {
  entry: ENTRY_LEASE_API,
  user: USER_LEASE_API,
  term: TERM_LEASE_API,
} as const;

/** Holds the entry's, user's or term's edit lease while its editor is open. */
export function useEditLease(
  kind: "entry" | "user" | "term",
  id: number,
): EditLease {
  return useLease(id, EDIT_LEASE_APIS[kind], true);
}

/** Holds a settings group's edit lease while its card is being edited. */
export function useSettingsGroupLease(
  group: string,
  active: boolean,
): EditLease {
  return useLease(group, SETTINGS_GROUP_LEASE_API, active);
}
