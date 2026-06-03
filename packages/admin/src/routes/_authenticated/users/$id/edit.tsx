import type { MessageDescriptor } from "@lingui/core";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { FormEditSkeleton } from "@/components/form/edit-skeleton.js";
import { MetaBoxCard } from "@/components/meta-box/meta-box.js";
import {
  AdminApiTokensCard,
  SelfApiTokensCard,
} from "@/components/profile/api-tokens-card.js";
import { LanguageCard } from "@/components/profile/language-card.js";
import { PasskeysCard } from "@/components/profile/passkeys-card.js";
import { SessionsCard } from "@/components/profile/sessions-card.js";
import { UserEmailField } from "@/components/profile/user-email-field.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.js";
import { Input } from "@/components/ui/input.js";
import { Label as UILabel } from "@/components/ui/label.js";
import { hasCap } from "@/lib/caps.js";
import { visibleUserMetaBoxes } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useLabel } from "@/lib/use-label.js";
import { ROLE_LABEL, ROLE_LABEL_LONG } from "@/lib/user-role-labels.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import * as v from "valibot";

import type { UserMetaBoxManifestEntry } from "@plumix/core/manifest";
import type { User, UserRole } from "@plumix/core/schema";
import { seedFromMetaBoxes } from "@plumix/core/manifest";
import { idPathParam } from "@plumix/core/validation";

import {
  isUserRole,
  USER_ROLES,
  USERS_LIST_DEFAULT_SEARCH,
} from "../-constants.js";

// Descriptors needed outside their natural `<Trans>` callsite — pending
// / error component aria labels, state setters, `mapUserError` fallbacks.
// The three per-surface error bundles (`UPDATE_/STATUS_/DELETE_ERROR_MESSAGES`)
// hold their own reason-specific descriptors directly. Chrome strings
// stay inline at their `<Trans>` callsite.
const M = {
  loadingAria: defineMessage({
    id: "userEdit.loading.aria",
    message: "Loading user",
  }),
  loadFailed: defineMessage({
    id: "userEdit.loadFailed",
    message: "Couldn't load that user. They may have been deleted.",
  }),
  errUpdateFallback: defineMessage({
    id: "userEdit.error.updateFallback",
    message: "Couldn't save the changes. Try again.",
  }),
  errStatusFallback: defineMessage({
    id: "userEdit.error.statusFallback",
    message: "Couldn't change the account status. Try again.",
  }),
  errDeleteFallback: defineMessage({
    id: "userEdit.error.deleteFallback",
    message: "Couldn't delete the user. Try again.",
  }),
  toggleEnabling: defineMessage({
    id: "userEdit.status.toggle.enabling",
    message: "Enabling…",
  }),
  toggleDisabling: defineMessage({
    id: "userEdit.status.toggle.disabling",
    message: "Disabling…",
  }),
  toggleEnable: defineMessage({
    id: "userEdit.status.toggle.enable",
    message: "Re-enable user",
  }),
  toggleDisable: defineMessage({
    id: "userEdit.status.toggle.disable",
    message: "Disable user",
  }),
  reassignKeepAsIs: defineMessage({
    id: "userEdit.delete.reassign.keepAsIs",
    message: "Keep entries as-is (none to reassign)",
  }),
} satisfies Record<string, MessageDescriptor>;

async function invalidateUserCaches(
  queryClient: QueryClient,
  id: number,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: orpc.user.get.queryOptions({ input: { id } }).queryKey,
    }),
    queryClient.invalidateQueries({ queryKey: orpc.user.list.key() }),
  ]);
}

const profileFormSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.maxLength(100)),
  role: v.picklist(USER_ROLES),
  meta: v.record(v.string(), v.unknown()),
});

export const Route = createFileRoute("/_authenticated/users/$id/edit")({
  // Reject invalid ids as a router 404 before `beforeLoad` / `loader`
  // fire — no RPC, no stale-id flicker through the cache.
  params: {
    parse: (raw) => {
      const result = v.safeParse(idPathParam, raw.id);
      if (!result.success) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
        throw notFound();
      }
      return { id: result.output };
    },
  },
  // More permissive than `/users/` — a user without `user:list` can
  // still edit their OWN row, so this screen doubles as `/profile`
  // (which redirects here). Other-user edits require `user:list`; the
  // server's own `user:edit_own` / `user:edit` checks are the final
  // word, but surfacing the right screen is half the UX.
  beforeLoad: ({ context, params }) => {
    const isSelf = params.id === context.user.id;
    const canEditAny = hasCap(context.user.capabilities, "user:list");
    const canEditSelf =
      isSelf && hasCap(context.user.capabilities, "user:edit_own");
    if (!canEditAny && !canEditSelf) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/" });
    }
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.user.get.queryOptions({ input: { id: params.id } }),
    ),
  pendingComponent: UserEditLoading,
  errorComponent: UserEditLoadError,
  component: UserEditRoute,
});

function UserEditLoading(): ReactNode {
  const label = useLabel();
  return (
    <FormEditSkeleton
      ariaLabel={label(M.loadingAria)}
      testId="user-edit-loading"
    />
  );
}

function UserEditLoadError(): ReactNode {
  return <NotFoundPlaceholder message={M.loadFailed} />;
}

function UserEditRoute(): ReactNode {
  const { id: userId } = Route.useParams();
  const { user: session } = Route.useRouteContext();
  const isSelf = userId === session.id;

  // Self can't self-promote, self-disable, or self-delete — the `!isSelf`
  // gate mirrors WP's user-edit UX and keeps the last-admin-lockout
  // surface entirely server-side.
  function otherUserCap(cap: string): boolean {
    return !isSelf && hasCap(session.capabilities, cap);
  }
  const canPromote = otherUserCap("user:promote");
  const canDisable = otherUserCap("user:edit");
  const canDelete = otherUserCap("user:delete");
  const canManageOtherTokens = otherUserCap("user:manage_tokens");
  // Match the server's actual write permission — editors can view the
  // edit screen (via `user:list`) but don't get `user:edit`, so we
  // disable Save / Name input instead of letting them hit a server 403.
  const canSave = isSelf
    ? hasCap(session.capabilities, "user:edit_own")
    : hasCap(session.capabilities, "user:edit");

  const { data: target } = useSuspenseQuery(
    orpc.user.get.queryOptions({ input: { id: userId } }),
  );
  const metaBoxes = visibleUserMetaBoxes(session.capabilities);
  return (
    <UserEditForm
      // Remount after each save so `useForm` re-reads `defaultValues`
      // from the refetched row. Same pattern as `/entries/$slug/$id`.
      key={
        target.updatedAt instanceof Date
          ? target.updatedAt.toISOString()
          : String(target.updatedAt)
      }
      target={target}
      isSelf={isSelf}
      canPromote={canPromote}
      canSave={canSave}
      canDisable={canDisable}
      canDelete={canDelete}
      canManageOtherTokens={canManageOtherTokens}
      metaBoxes={metaBoxes}
    />
  );
}

function useUserUpdateMutation({
  target,
  canPromote,
  metaBoxes,
  queryClient,
  setServerError,
}: {
  target: User;
  canPromote: boolean;
  metaBoxes: readonly UserMetaBoxManifestEntry[];
  queryClient: QueryClient;
  setServerError: (message: MessageDescriptor | null) => void;
}) {
  return useMutation({
    mutationFn: (values: {
      name: string;
      role: UserRole;
      meta: Readonly<Record<string, unknown>>;
    }) =>
      orpc.user.update.call({
        id: target.id,
        name: values.name.length > 0 ? values.name : null,
        // Only send role if the caller can change it AND it actually
        // differs — avoids a needless `user:promote` cap check on the
        // server for name-only edits.
        ...(canPromote && values.role !== target.role
          ? { role: values.role }
          : {}),
        meta: metaBoxes.length > 0 ? values.meta : undefined,
      }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: async () => {
      // Parent route remounts via the target.updatedAt key on refetch,
      // so the form re-reads defaultValues (including sanitized meta)
      // from the fresh row automatically.
      await invalidateUserCaches(queryClient, target.id);
    },
    onError: (err) => {
      setServerError(
        mapUserError(err, UPDATE_ERROR_MESSAGES, M.errUpdateFallback),
      );
    },
  });
}

function UserEditForm({
  target,
  isSelf,
  canPromote,
  canSave,
  canDisable,
  canDelete,
  canManageOtherTokens,
  metaBoxes,
}: {
  target: User;
  isSelf: boolean;
  canPromote: boolean;
  canSave: boolean;
  canDisable: boolean;
  canDelete: boolean;
  canManageOtherTokens: boolean;
  metaBoxes: readonly UserMetaBoxManifestEntry[];
}): ReactNode {
  const navigate = useNavigate();
  const label = useLabel();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<MessageDescriptor | null>(
    null,
  );

  const updateUser = useUserUpdateMutation({
    target,
    canPromote,
    metaBoxes,
    queryClient,
    setServerError,
  });

  const form = useForm({
    resolver: valibotResolver(profileFormSchema),
    defaultValues: {
      name: target.name ?? "",
      role: target.role,
      meta: seedFromMetaBoxes(metaBoxes, target.meta),
    },
  });

  const onSubmit = form.handleSubmit((value) => {
    updateUser.mutate(value);
  });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        to="/users"
        search={USERS_LIST_DEFAULT_SEARCH}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        data-testid="user-edit-back-link"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        <Trans id="userEdit.backToList" message="Back to users" />
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>
            <h1 data-testid="user-edit-heading">
              {isSelf ? (
                <Trans id="userEdit.title.self" message="Your profile" />
              ) : (
                <Trans
                  id="userEdit.title.other"
                  message="Edit {email}"
                  values={{ email: target.email }}
                  comment="email: the user being edited"
                />
              )}
            </h1>
          </CardTitle>
          <CardDescription>
            {isSelf ? (
              <Trans
                id="userEdit.description.self"
                message="Update your display name. Role and account state are managed by administrators."
              />
            ) : (
              <Trans
                id="userEdit.description.other"
                message="Update this account's details. Role changes invalidate existing sessions immediately."
              />
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <UserEmailField
                userId={target.id}
                email={target.email}
                canEdit={canSave}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Trans id="userEdit.name.label" message="Name" />
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        autoComplete="name"
                        disabled={updateUser.isPending || !canSave}
                        data-testid="user-edit-name-input"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {canPromote ? (
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Trans id="userEdit.role.label" message="Role" />
                      </FormLabel>
                      <FormControl>
                        <select
                          value={field.value}
                          onBlur={field.onBlur}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (isUserRole(next)) field.onChange(next);
                          }}
                          disabled={updateUser.isPending}
                          data-testid="user-edit-role-select"
                          className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {USER_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {label(ROLE_LABEL_LONG[role])}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <UILabel>
                    <Trans id="userEdit.role.label" message="Role" />
                  </UILabel>
                  <Badge variant="secondary" className="w-fit">
                    {label(ROLE_LABEL[target.role])}
                  </Badge>
                  {isSelf ? (
                    <p className="text-muted-foreground text-xs">
                      <Trans
                        id="userEdit.role.selfReadonly"
                        message="Only another administrator can change your role."
                      />
                    </p>
                  ) : null}
                </div>
              )}

              {metaBoxes.map((box) => (
                <MetaBoxCard
                  key={box.id}
                  box={box}
                  basePath="meta"
                  disabled={updateUser.isPending || !canSave}
                />
              ))}

              {serverError ? (
                <Alert
                  variant="destructive"
                  data-testid="user-edit-server-error"
                >
                  <AlertDescription>{label(serverError)}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void navigate({
                      to: "/users",
                      search: USERS_LIST_DEFAULT_SEARCH,
                    });
                  }}
                  disabled={updateUser.isPending}
                >
                  <Trans id="userEdit.cancel" message="Cancel" />
                </Button>
                <Button
                  type="submit"
                  disabled={updateUser.isPending || !canSave}
                  data-testid="user-edit-submit"
                >
                  {updateUser.isPending ? (
                    <Trans id="userEdit.submit.pending" message="Saving…" />
                  ) : (
                    <Trans id="userEdit.submit.idle" message="Save changes" />
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {canDisable ? <StatusCard target={target} /> : null}
      {canDelete ? <DeleteCard target={target} /> : null}

      {/* Self-service auth surface — only the user themselves manages
          their own credentials and signs out their other devices.
          Cross-user passkey/session management is intentionally not
          available, even to admins, since both surfaces are second-
          factor security primitives. */}
      {isSelf ? <LanguageCard userLocale={target.meta.locale} /> : null}
      {isSelf ? <PasskeysCard userEmail={target.email} /> : null}
      {isSelf ? <SessionsCard /> : null}

      {/* API tokens — self can mint + revoke own; admins with
          `user:manage_tokens` see + revoke (not mint, by design)
          another user's. */}
      {isSelf ? <SelfApiTokensCard /> : null}
      {!isSelf && canManageOtherTokens ? (
        <AdminApiTokensCard userId={target.id} />
      ) : null}
    </div>
  );
}

function StatusCard({ target }: { target: User }): ReactNode {
  const label = useLabel();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<MessageDescriptor | null>(
    null,
  );
  const isDisabled = target.disabledAt != null;

  const toggle = useMutation({
    mutationFn: () =>
      isDisabled
        ? orpc.user.enable.call({ id: target.id })
        : orpc.user.disable.call({ id: target.id }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: async () => {
      await invalidateUserCaches(queryClient, target.id);
    },
    onError: (err) => {
      setServerError(
        mapUserError(err, STATUS_ERROR_MESSAGES, M.errStatusFallback),
      );
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans id="userEdit.status.title" message="Account status" />
        </CardTitle>
        <CardDescription>
          {isDisabled ? (
            <Trans
              id="userEdit.status.description.disabled"
              message="Disabled accounts can't sign in. Re-enabling restores access; their passkey is still registered."
            />
          ) : (
            <Trans
              id="userEdit.status.description.active"
              message="Disabling signs the user out immediately and blocks future sign-ins. Their entries stay published."
            />
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          {/* Reuse `users.list.row.*` IDs — same English, same translation. */}
          <Badge variant={isDisabled ? "destructive" : "secondary"}>
            {isDisabled ? (
              <Trans id="users.list.row.disabled" message="Disabled" />
            ) : (
              <Trans id="users.list.row.active" message="Active" />
            )}
          </Badge>
          <Button
            variant={isDisabled ? "default" : "outline"}
            onClick={() => {
              toggle.mutate();
            }}
            disabled={toggle.isPending}
            data-testid={
              isDisabled
                ? "user-edit-enable-button"
                : "user-edit-disable-button"
            }
          >
            {label(toggleButtonLabel(isDisabled, toggle.isPending))}
          </Button>
        </div>
        {serverError ? (
          <Alert variant="destructive" data-testid="user-status-error">
            <AlertDescription>{label(serverError)}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function toggleButtonLabel(
  isDisabled: boolean,
  isPending: boolean,
): MessageDescriptor {
  if (isPending) return isDisabled ? M.toggleEnabling : M.toggleDisabling;
  return isDisabled ? M.toggleEnable : M.toggleDisable;
}

function DeleteCard({ target }: { target: User }): ReactNode {
  const navigate = useNavigate();
  const label = useLabel();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [reassignTo, setReassignTo] = useState<number | null>(null);
  const [serverError, setServerError] = useState<MessageDescriptor | null>(
    null,
  );

  // Everyone except the user being deleted — populates the reassign
  // dropdown. 100-item cap is fine for the single-site MVP; larger
  // deployments will want a typeahead, which we can slot in later by
  // swapping this query for a debounced search list.
  const candidates = useQuery({
    ...orpc.user.list.queryOptions({ input: { limit: 100 } }),
    enabled: confirming,
  });
  const reassignOptions = (candidates.data ?? []).filter(
    (u) => u.id !== target.id,
  );

  const deleteUser = useMutation({
    mutationFn: () =>
      orpc.user.delete.call({
        id: target.id,
        ...(reassignTo != null ? { reassignTo } : {}),
      }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: async () => {
      // Purge the now-deleted row from the list cache before we land
      // there — otherwise the destination renders stale within the
      // list's staleTime window.
      await queryClient.invalidateQueries({
        queryKey: orpc.user.list.key(),
      });
      void navigate({ to: "/users", search: USERS_LIST_DEFAULT_SEARCH });
    },
    onError: (err) => {
      setServerError(
        mapUserError(err, DELETE_ERROR_MESSAGES, M.errDeleteFallback),
      );
    },
  });

  if (!confirming) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">
            <Trans id="userEdit.delete.title" message="Delete user" />
          </CardTitle>
          <CardDescription>
            <Trans
              id="userEdit.delete.description"
              message="Permanent. Their entries stay, but you'll choose who inherits authorship."
            />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => {
              setConfirming(true);
            }}
            data-testid="user-edit-delete-button"
          >
            <Trans id="userEdit.delete.button" message="Delete user" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive">
          <Trans
            id="userEdit.delete.confirm.title"
            message="Confirm delete: {email}"
            values={{ email: target.email }}
            comment="email: the user account being deleted"
          />
        </CardTitle>
        <CardDescription>
          <Trans
            id="userEdit.delete.confirm.description"
            message='If this user authored any entries, the next step reassigns them. Leave "Keep entries as-is" if they have none.'
          />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <UILabel htmlFor="reassign-to">
            <Trans
              id="userEdit.delete.reassign.label"
              message="Reassign entries to"
            />
          </UILabel>
          <select
            id="reassign-to"
            value={reassignTo == null ? "" : String(reassignTo)}
            onChange={(e) => {
              const raw = e.target.value;
              setReassignTo(raw === "" ? null : Number(raw));
            }}
            disabled={deleteUser.isPending || candidates.isPending}
            data-testid="user-delete-reassign-select"
            className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">{label(M.reassignKeepAsIs)}</option>
            {reassignOptions.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.name ?? u.email} ({u.email})
              </option>
            ))}
          </select>
        </div>

        {serverError ? (
          <Alert variant="destructive" data-testid="user-delete-error">
            <AlertDescription>{label(serverError)}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setConfirming(false);
              setReassignTo(null);
              setServerError(null);
            }}
            disabled={deleteUser.isPending}
          >
            <Trans id="userEdit.cancel" message="Cancel" />
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              deleteUser.mutate();
            }}
            disabled={deleteUser.isPending}
            data-testid="user-delete-confirm-button"
          >
            {deleteUser.isPending ? (
              <Trans id="userEdit.delete.confirm.pending" message="Deleting…" />
            ) : (
              <Trans
                id="userEdit.delete.confirm.idle"
                message="Delete forever"
              />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type ErrorMessages = Partial<Record<string, MessageDescriptor>>;

// CONFLICT→friendly-copy lookup for user-mutation surfaces. Each caller
// passes its own `overrides` for per-action phrasing (the `last_admin`
// message reads differently depending on whether you're demoting,
// disabling, or deleting) plus a `fallback` for unmapped errors.
function mapUserError(
  err: unknown,
  overrides: ErrorMessages,
  fallback: MessageDescriptor,
): MessageDescriptor {
  const reason =
    err && typeof err === "object" && "data" in err
      ? (err as { data?: { reason?: string } }).data?.reason
      : undefined;
  const descriptor = reason != null ? overrides[reason] : undefined;
  return descriptor ?? fallback;
}

// Per-surface message bundles. Kept near the call sites (not inline at
// `onError`) so adding a new reason is a one-line edit per surface.
// `last_admin` reads differently per action, hence the three records.
const UPDATE_ERROR_MESSAGES: ErrorMessages = {
  last_admin: defineMessage({
    id: "userEdit.error.lastAdmin.update",
    message:
      "Can't do that — this is the last administrator. Promote someone else first.",
  }),
  email_taken: defineMessage({
    id: "userEdit.error.emailTaken",
    message: "A user with that email already exists.",
  }),
};
const STATUS_ERROR_MESSAGES: ErrorMessages = {
  last_admin: defineMessage({
    id: "userEdit.error.lastAdmin.status",
    message:
      "Can't disable the last administrator. Promote someone else first.",
  }),
};
const DELETE_ERROR_MESSAGES: ErrorMessages = {
  last_admin: defineMessage({
    id: "userEdit.error.lastAdmin.delete",
    message: "Can't delete the last administrator. Promote someone else first.",
  }),
  has_entries: defineMessage({
    id: "userEdit.error.hasEntries",
    message:
      "This user has authored entries. Pick someone to reassign them to above.",
  }),
  reassign_to_self: defineMessage({
    id: "userEdit.error.reassignToSelf",
    message: "Can't reassign to the user being deleted.",
  }),
};

function NotFoundPlaceholder({
  message,
}: {
  readonly message: MessageDescriptor;
}): ReactNode {
  const label = useLabel();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">
        <Trans id="userEdit.notFound.title" message="Not found" />
      </h1>
      <p className="text-muted-foreground text-sm">{label(message)}</p>
    </div>
  );
}
