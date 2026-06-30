import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { hasCap } from "@/lib/caps.js";
import { copyText } from "@/lib/clipboard.js";
import { ADMIN_BASE_PATH } from "@/lib/constants.js";
import { orpc } from "@/lib/orpc.js";
import { useLabel } from "@/lib/use-label.js";
import { ROLE_LABEL_LONG } from "@/lib/user-role-labels.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { defineMessage } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import * as v from "valibot";

import type { Label } from "@plumix/core/i18n";
import type { User, UserRole } from "@plumix/core/schema";
import { Alert, AlertDescription } from "@plumix/admin-ui/alert";
import { Button } from "@plumix/admin-ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plumix/admin-ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@plumix/admin-ui/form";
import { ArrowLeft, Check, Copy } from "@plumix/admin-ui/icons";
import { Input } from "@plumix/admin-ui/input";
import { Label as UILabel } from "@plumix/admin-ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plumix/admin-ui/select";
import { vMessage } from "@plumix/core/validation";

import {
  isUserRole,
  USER_ROLES,
  USERS_LIST_DEFAULT_SEARCH,
} from "./-constants.js";

// Descriptors used outside JSX — error setters, copy-button aria label.
const M = {
  copyAria: defineMessage({
    id: "userInvite.copy.aria",
    message: "Copy invite link",
  }),
  errEmailTaken: defineMessage({
    id: "userInvite.error.emailTaken",
    message: "A user with that email already exists.",
  }),
  errFallback: defineMessage({
    id: "userInvite.error.fallback",
    message: "Couldn't send invite. Try again.",
  }),
} satisfies Record<string, MessageDescriptor>;

// Client-side validation mirrors `userInviteInputSchema` on the server so
// the user gets instant feedback; the server remains the authoritative
// gate.
const inviteFormSchema = v.object({
  email: v.pipe(
    v.string(),
    v.trim(),
    v.email(
      vMessage(
        defineMessage({
          id: "userInvite.email.invalid",
          message: "Enter a valid email address",
        }),
      ),
    ),
    v.maxLength(255),
  ),
  name: v.pipe(v.string(), v.trim(), v.maxLength(100)),
  role: v.picklist(USER_ROLES),
});

export const Route = createFileRoute("/_authenticated/users/create")({
  beforeLoad: ({ context }) => {
    // `user:create` is admin-only. Defense in depth — the sidebar button
    // is already gated on this cap but someone following a direct link
    // shouldn't land on a forbidden form.
    if (!hasCap(context.user.capabilities, "user:create")) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/users", search: USERS_LIST_DEFAULT_SEARCH });
    }
  },
  component: InviteUserRoute,
});

// We render one of two views: the form (idle) or the success screen with
// the shareable URL. The submitting state is tracked separately via
// `inviteUser.isPending`, not by this union. Discriminated union here so
// the success payload (user + url) correlates with the status without
// nullable juggling.
type ViewState =
  { status: "idle" } | { status: "success"; user: User; inviteUrl: string };

function InviteUserRoute(): ReactNode {
  const navigate = useNavigate();
  const label = useLabel();
  const [view, setView] = useState<ViewState>({ status: "idle" });
  // String branch carries plugin-author `err.message` verbatim.
  const [serverError, setServerError] = useState<Label | null>(null);

  const inviteUser = useMutation({
    mutationFn: (input: { email: string; name: string; role: UserRole }) =>
      orpc.user.invite.call({
        email: input.email,
        role: input.role,
        ...(input.name.length > 0 ? { name: input.name } : {}),
      }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: (result) => {
      setView({
        status: "success",
        user: result.user,
        inviteUrl: buildInviteUrl(result.inviteToken),
      });
    },
    onError: (err) => {
      setServerError(mapInviteError(err));
    },
  });

  const form = useForm({
    resolver: valibotResolver(inviteFormSchema),
    defaultValues: { email: "", name: "", role: "subscriber" as UserRole },
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((value) => {
    inviteUser.mutate(value);
  });

  if (view.status === "success") {
    return (
      <InviteSuccess
        user={view.user}
        inviteUrl={view.inviteUrl}
        onInviteAnother={() => {
          setView({ status: "idle" });
          setServerError(null);
          form.reset();
        }}
        onBackToList={() => {
          void navigate({ to: "/users", search: USERS_LIST_DEFAULT_SEARCH });
        }}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        to="/users"
        search={USERS_LIST_DEFAULT_SEARCH}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        data-testid="invite-back-link"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        <Trans id="userInvite.backToList" message="Back to users" />
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 data-testid="invite-heading">
              <Trans id="userInvite.title" message="Invite user" />
            </h1>
          </CardTitle>
          <CardDescription>
            <Trans
              id="userInvite.description"
              message="They'll enrol a passkey the first time they open the invite link. No password required."
            />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Trans id="userInvite.email.label" message="Email" />
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        required
                        disabled={inviteUser.isPending}
                        data-testid="invite-email-input"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Trans id="userInvite.name.label" message="Name" />
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        autoComplete="name"
                        disabled={inviteUser.isPending}
                        data-testid="invite-name-input"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Trans id="userInvite.role.label" message="Role" />
                    </FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(next) => {
                        // Radix yields a bare string — narrow back to
                        // `UserRole` before forwarding.
                        if (isUserRole(next)) field.onChange(next);
                      }}
                      disabled={inviteUser.isPending}
                    >
                      <FormControl>
                        <SelectTrigger
                          className="w-full"
                          onBlur={field.onBlur}
                          data-testid="invite-role-select"
                        >
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {USER_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {label(ROLE_LABEL_LONG[role])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {serverError ? (
                <Alert variant="destructive" data-testid="invite-server-error">
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
                  disabled={inviteUser.isPending}
                >
                  <Trans id="userInvite.cancel" message="Cancel" />
                </Button>
                <Button
                  type="submit"
                  disabled={inviteUser.isPending}
                  data-testid="invite-submit"
                >
                  {inviteUser.isPending ? (
                    <Trans id="userInvite.submit.pending" message="Inviting…" />
                  ) : (
                    <Trans id="userInvite.submit.idle" message="Send invite" />
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

// Absolute URL so the admin can copy-paste into an email client without
// post-processing. Admin is SPA-only so `window` is always defined here
// (jsdom covers the test path).
function buildInviteUrl(token: string): string {
  return `${window.location.origin}${ADMIN_BASE_PATH}/accept-invite/${token}`;
}

// Surface server-side errors with a human-friendly message where we can.
// The RPC layer throws with `.data.reason` on CONFLICT — everything else
// falls through as a generic "try again".
function mapInviteError(err: unknown): Label {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { reason?: string } }).data;
    if (data?.reason === "email_taken") return M.errEmailTaken;
  }
  if (err instanceof Error) return err.message;
  return M.errFallback;
}

function InviteSuccess({
  user,
  inviteUrl,
  onInviteAnother,
  onBackToList,
}: {
  user: User;
  inviteUrl: string;
  onInviteAnother: () => void;
  onBackToList: () => void;
}): ReactNode {
  const { i18n } = useLingui();
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await copyText(inviteUrl);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // Clipboard API is gated in non-HTTPS / iframed / Permissions-Policy
      // contexts. Select the input so the user can fall back to ⌘-C /
      // Ctrl-C — better than a dead button that looks like it worked.
      const input = document.getElementById("invite-url");
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
    }
  };

  // Hoisted: lingui/no-expression-in-message rejects member exprs inline.
  const bdiEmail = <bdi>{user.email}</bdi>;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 data-testid="invite-success-heading">
              <Trans id="userInvite.success.title" message="Invite ready" />
            </h1>
          </CardTitle>
          <CardDescription>
            <Trans
              id="userInvite.success.description"
              message="Share the link below with {email}. They'll enrol a passkey the first time they open it. Link expires in 7 days."
              values={{ email: bdiEmail }}
              comment="email: the invited user's address"
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <UILabel htmlFor="invite-url">
              <Trans id="userInvite.success.link.label" message="Invite link" />
            </UILabel>
            <div className="flex gap-2">
              <input
                id="invite-url"
                readOnly
                value={inviteUrl}
                onFocus={(e) => {
                  e.currentTarget.select();
                }}
                data-testid="invite-url-input"
                className="border-input bg-muted text-muted-foreground flex h-9 w-full rounded-md border px-3 py-1 font-mono text-sm focus-visible:outline-none"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void copy();
                }}
                data-testid="invite-copy-button"
                aria-label={i18n._(M.copyAria.id, undefined, {
                  message: M.copyAria.message,
                })}
              >
                {copied ? (
                  <>
                    <Check />
                    <span>
                      <Trans id="userInvite.copy.copied" message="Copied" />
                    </span>
                  </>
                ) : (
                  <>
                    <Copy />
                    <span>
                      <Trans id="userInvite.copy.idle" message="Copy" />
                    </span>
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onInviteAnother}
              data-testid="invite-another-button"
            >
              <Trans id="userInvite.success.another" message="Invite another" />
            </Button>
            <Button
              type="button"
              onClick={onBackToList}
              data-testid="invite-done-button"
            >
              <Trans
                id="userInvite.success.backToList"
                message="Back to users"
              />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
