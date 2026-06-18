import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { toDate } from "@/lib/dates.js";
import { extractCode, extractReason } from "@/lib/orpc-errors.js";
import { orpc } from "@/lib/orpc.js";
import { PasskeyError } from "@/lib/passkey-errors.js";
import { registerWithPasskey } from "@/lib/passkey.js";
import { useFormatters } from "@/lib/use-formatters.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Label } from "@plumix/core/i18n";
import { Alert, AlertDescription } from "@plumix/admin-ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@plumix/admin-ui/alert-dialog";
import { Badge } from "@plumix/admin-ui/badge";
import { Button } from "@plumix/admin-ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plumix/admin-ui/card";
import { Input } from "@plumix/admin-ui/input";
import { Label as UILabel } from "@plumix/admin-ui/label";

const M = {
  unnamed: defineMessage({
    id: "profile.passkeys.unnamed",
    message: "Unnamed passkey",
  }),
  // Transport labels — WebAuthn-derived display copy.
  transportInternal: defineMessage({
    id: "profile.passkeys.transport.internal",
    message: "This device",
  }),
  transportHybrid: defineMessage({
    id: "profile.passkeys.transport.hybrid",
    message: "Cross-device",
  }),
  transportSecurityKey: defineMessage({
    id: "profile.passkeys.transport.securityKey",
    message: "Security key",
  }),
  // Validation / rename inline error.
  nameEmpty: defineMessage({
    id: "profile.passkeys.rename.nameEmpty",
    message: "Name can't be empty.",
  }),
  // Shared "this passkey is gone" — surfaced by both the rename and
  // delete error helpers when the server returns NOT_FOUND.
  notFound: defineMessage({
    id: "profile.passkeys.notFound",
    message: "This passkey no longer exists. Refresh the list.",
  }),
  // Shared "must keep one" copy — used as both the delete-disabled
  // tooltip on the row button and the explicit `last_credential`
  // reason returned by the server.
  lastCredential: defineMessage({
    id: "profile.passkeys.lastCredential",
    message: "You can't delete your last passkey. Add another one first.",
  }),
  renameFallback: defineMessage({
    id: "profile.passkeys.rename.fallback",
    message: "Couldn't rename the passkey. Try again.",
  }),
  deleteFallback: defineMessage({
    id: "profile.passkeys.delete.fallback",
    message: "Couldn't delete the passkey. Try again.",
  }),
  enrollCancelled: defineMessage({
    id: "profile.passkeys.enroll.cancelled",
    message: "Cancelled. Tap Add passkey when you're ready.",
  }),
  enrollAlreadyRegistered: defineMessage({
    id: "profile.passkeys.enroll.alreadyRegistered",
    message: "That passkey is already registered on this account.",
  }),
  enrollNoAuthenticator: defineMessage({
    id: "profile.passkeys.enroll.noAuthenticator",
    message: "This device doesn't support passkeys.",
  }),
  enrollNetworkError: defineMessage({
    id: "profile.passkeys.enroll.networkError",
    message: "Network error. Check your connection and try again.",
  }),
  enrollEmailMismatch: defineMessage({
    id: "profile.passkeys.enroll.emailMismatch",
    message: "Couldn't enrol — re-sign-in and try again.",
  }),
  enrollFallback: defineMessage({
    id: "profile.passkeys.enroll.fallback",
    message: "Couldn't enrol the passkey. Try again.",
  }),
} satisfies Record<string, MessageDescriptor>;

interface PasskeyWire {
  readonly id: string;
  readonly name: string | null;
  readonly isBackedUp: boolean;
  readonly transports: readonly string[] | null;
  readonly createdAt: Date | string;
  readonly lastUsedAt: Date | string;
}

interface PasskeysCardProps {
  /**
   * The viewer's email — required by `registerWithPasskey` for the
   * add-device WebAuthn challenge. The server enforces
   * `authed.email === input.email` so passing `target.email` from a
   * self-edit screen is the contract.
   */
  readonly userEmail: string;
}

export function PasskeysCard({ userEmail }: PasskeysCardProps): ReactNode {
  const label = useLabel();
  const queryClient = useQueryClient();
  const [enrollError, setEnrollError] = useState<Label | null>(null);

  const list = useQuery(orpc.auth.credentials.list.queryOptions({ input: {} }));

  const invalidateList = (): Promise<void> =>
    queryClient.invalidateQueries({
      queryKey: orpc.auth.credentials.list.key(),
    });

  const enroll = useMutation({
    mutationFn: () => registerWithPasskey({ email: userEmail }),
    onMutate: () => {
      setEnrollError(null);
    },
    onSuccess: () => invalidateList(),
    onError: (err) => {
      setEnrollError(formatPasskeyEnrollError(err));
    },
  });

  return (
    <Card data-testid="profile-passkeys-card">
      <CardHeader>
        <CardTitle>
          <Trans id="profile.passkeys.title" message="Passkeys" />
        </CardTitle>
        <CardDescription>
          <Trans
            id="profile.passkeys.description"
            message="Devices that can sign in to this account. Add a new one before deleting an old one — at least one passkey must remain."
          />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {list.isPending ? (
          <p className="text-muted-foreground text-sm">
            <Trans id="profile.passkeys.loading" message="Loading…" />
          </p>
        ) : list.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              <Trans
                id="profile.passkeys.loadFailed"
                message="Couldn't load your passkeys. Refresh and try again."
              />
            </AlertDescription>
          </Alert>
        ) : list.data.length > 0 ? (
          <ul
            className="divide-border divide-y"
            data-testid="profile-passkeys-list"
          >
            {list.data.map((cred) => (
              <PasskeyRow
                key={cred.id}
                cred={cred}
                isLast={list.data.length === 1}
                onChanged={invalidateList}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            <Trans
              id="profile.passkeys.empty"
              message="No passkeys registered. Add one to enable sign-in."
            />
          </p>
        )}

        {enrollError ? (
          <Alert
            variant="destructive"
            data-testid="profile-passkeys-enroll-error"
          >
            <AlertDescription>{label(enrollError)}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              enroll.mutate();
            }}
            disabled={enroll.isPending}
            data-testid="profile-passkeys-enroll-button"
          >
            {enroll.isPending ? (
              <Trans id="profile.passkeys.enroll.pending" message="Adding…" />
            ) : (
              <Trans id="profile.passkeys.enroll.idle" message="Add passkey" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface PasskeyRowProps {
  readonly cred: PasskeyWire;
  readonly isLast: boolean;
  readonly onChanged: () => Promise<void> | void;
}

function PasskeyRow({ cred, isLast, onChanged }: PasskeyRowProps): ReactNode {
  const label = useLabel();
  const { formatDate } = useFormatters();
  const createdAt = toDate(cred.createdAt);
  const lastUsedAt = toDate(cred.lastUsedAt);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cred.name ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [renameError, setRenameError] = useState<Label | null>(null);
  const [deleteError, setDeleteError] = useState<Label | null>(null);

  const rename = useMutation({
    mutationFn: (name: string) =>
      orpc.auth.credentials.rename.call({ id: cred.id, name }),
    onMutate: () => {
      setRenameError(null);
    },
    onSuccess: async () => {
      setEditing(false);
      await onChanged();
    },
    onError: (err) => {
      setRenameError(formatRenameError(err));
    },
  });

  const remove = useMutation({
    mutationFn: () => orpc.auth.credentials.delete.call({ id: cred.id }),
    onMutate: () => {
      setDeleteError(null);
    },
    onSuccess: async () => {
      setConfirmingDelete(false);
      await onChanged();
    },
    onError: (err) => {
      setDeleteError(formatDeleteError(err));
    },
  });

  const displayName = cred.name ?? label(M.unnamed);
  const transportDescriptor = pickTransportDescriptor(cred);

  return (
    <li className="flex flex-col gap-2 py-3" data-testid="profile-passkey-row">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {editing ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = draft.trim();
                if (trimmed.length === 0) {
                  setRenameError(M.nameEmpty);
                  return;
                }
                rename.mutate(trimmed);
              }}
            >
              <UILabel
                htmlFor={`passkey-name-${cred.id}`}
                className="text-muted-foreground text-xs"
              >
                <Trans
                  id="profile.passkeys.rename.label"
                  message="Rename passkey"
                />
              </UILabel>
              <Input
                id={`passkey-name-${cred.id}`}
                value={draft}
                maxLength={64}
                onChange={(e) => {
                  setDraft(e.target.value);
                }}
                data-testid="profile-passkey-rename-input"
                autoFocus
              />
              {renameError ? (
                <Alert
                  variant="destructive"
                  data-testid="profile-passkey-rename-error"
                >
                  <AlertDescription>{label(renameError)}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setDraft(cred.name ?? "");
                    setRenameError(null);
                  }}
                  disabled={rename.isPending}
                >
                  <Trans id="profile.passkeys.rename.cancel" message="Cancel" />
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={rename.isPending}
                  data-testid="profile-passkey-rename-submit"
                >
                  {rename.isPending ? (
                    <Trans
                      id="profile.passkeys.rename.pending"
                      message="Saving…"
                    />
                  ) : (
                    <Trans id="profile.passkeys.rename.save" message="Save" />
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <p
                className="text-sm font-medium"
                data-testid="profile-passkey-name"
              >
                {displayName}
              </p>
              <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                {transportDescriptor ? (
                  <span>{label(transportDescriptor)}</span>
                ) : null}
                {cred.isBackedUp ? (
                  <Badge variant="secondary">
                    <Trans id="profile.passkeys.synced" message="Synced" />
                  </Badge>
                ) : null}
                <span>
                  <Trans
                    id="profile.passkeys.added"
                    message="Added {date}"
                    values={{ date: formatDate(createdAt) }}
                    comment="date: a locale-formatted date string"
                  />
                </span>
                {lastUsedAt.getTime() !== createdAt.getTime() ? (
                  <span>
                    <Trans
                      id="profile.passkeys.lastUsed"
                      message="Last used {date}"
                      values={{ date: formatDate(lastUsedAt) }}
                      comment="date: a locale-formatted date string"
                    />
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>
        {!editing ? (
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(true);
                setDraft(cred.name ?? "");
              }}
              data-testid="profile-passkey-rename-button"
            >
              <Trans id="profile.passkeys.rename.button" message="Rename" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                setConfirmingDelete(true);
              }}
              disabled={isLast}
              title={isLast ? label(M.lastCredential) : undefined}
              data-testid="profile-passkey-delete-button"
            >
              <Trans id="profile.passkeys.delete.button" message="Delete" />
            </Button>
          </div>
        ) : null}
      </div>

      <AlertDialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmingDelete(false);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans
                id="profile.passkeys.delete.title"
                message="Delete this passkey?"
              />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                id="profile.passkeys.delete.description"
                message='The device that registered "{name}" will no longer be able to sign in. You can re-enrol it later.'
                values={{ name: <bdi>{displayName}</bdi> }}
                comment="name: the user-chosen passkey nickname (e.g. 'MacBook', 'iPhone')"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <Alert
              variant="destructive"
              data-testid="profile-passkey-delete-error"
            >
              <AlertDescription>{label(deleteError)}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              <Trans id="profile.passkeys.delete.cancel" message="Cancel" />
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="profile-passkey-delete-confirm"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
            >
              {remove.isPending ? (
                <Trans
                  id="profile.passkeys.delete.pending"
                  message="Deleting…"
                />
              ) : (
                <Trans
                  id="profile.passkeys.delete.confirm"
                  message="Delete passkey"
                />
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function pickTransportDescriptor(cred: PasskeyWire): MessageDescriptor | null {
  const transports = cred.transports;
  if (!transports || transports.length === 0) return null;
  // Map WebAuthn transport tokens to readable copy. "internal" = platform
  // authenticator (Touch ID / Windows Hello); "hybrid" = QR-paired phone
  // ceremony; everything else (`usb`, `nfc`, `ble`) is some flavour of
  // hardware security key — collapse to one bucket rather than expose
  // raw transport tokens to end users.
  if (transports.includes("internal")) return M.transportInternal;
  if (transports.includes("hybrid")) return M.transportHybrid;
  return M.transportSecurityKey;
}

function formatRenameError(err: unknown): Label {
  if (extractCode(err) === "NOT_FOUND") return M.notFound;
  if (err instanceof Error) return err.message;
  return M.renameFallback;
}

function formatDeleteError(err: unknown): Label {
  if (extractReason(err) === "last_credential") return M.lastCredential;
  if (extractCode(err) === "NOT_FOUND") return M.notFound;
  if (err instanceof Error) return err.message;
  return M.deleteFallback;
}

// Surface-specific copy for `registerWithPasskey` failures during add-
// device. Mirrors the login screen's PasskeyError → friendly-message
// table but tuned to the "you're already signed in, adding a device"
// flow (no `registration_closed` because authed users always pass that
// check).
function formatPasskeyEnrollError(err: unknown): Label {
  if (err instanceof PasskeyError) {
    switch (err.code) {
      case "user_cancelled":
        return M.enrollCancelled;
      case "credential_already_registered":
        return M.enrollAlreadyRegistered;
      case "no_authenticator":
        return M.enrollNoAuthenticator;
      case "network_error":
        return M.enrollNetworkError;
      case "email_mismatch":
        return M.enrollEmailMismatch;
    }
  }
  if (err instanceof Error) return err.message;
  return M.enrollFallback;
}
