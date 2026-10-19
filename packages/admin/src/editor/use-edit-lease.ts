import type {
  EditLeaseApi,
  EditLeaseSession,
  EditLeaseState,
  LeaseRefusal,
} from "@/editor/edit-lease.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { createEditLeaseSession } from "@/editor/edit-lease.js";
import { orpc } from "@/lib/orpc.js";

export interface EditLease {
  readonly state: EditLeaseState;
  readonly takeOver: () => Promise<void>;
  readonly lose: (refusal: LeaseRefusal) => void;
}

const ENTRY_LEASE_API: EditLeaseApi = {
  acquire: (input) => orpc.entry.lease.acquire.call(input),
  renew: (input) => orpc.entry.lease.renew.call(input),
  release: (input) => orpc.entry.lease.release.call(input),
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

/** Holds the entry's edit lease while the editor is open. */
export function useEditLease(id: number): EditLease {
  return useLease(id, ENTRY_LEASE_API, true);
}

/** Holds a settings group's edit lease while its card is being edited. */
export function useSettingsGroupLease(
  group: string,
  active: boolean,
): EditLease {
  return useLease(group, SETTINGS_GROUP_LEASE_API, active);
}
