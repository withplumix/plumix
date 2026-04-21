import type { ReactNode } from "react";
import { useState } from "react";
import { FormField } from "@/components/form/field.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { Label } from "@/components/ui/label.js";
import { ADMIN_BASE_PATH } from "@/lib/constants.js";
import { orpc } from "@/lib/orpc.js";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { ArrowLeft, Check, Copy } from "lucide-react";
import * as v from "valibot";

import type { User, UserRole } from "@plumix/core/schema";

import { USERS_LIST_DEFAULT_SEARCH } from "./index.js";

// Mirrors `USER_ROLES` from core — kept local so the valibot picklist
// stays tree-shakeable. `UserRole` type import keeps it in lockstep.
const USER_ROLES: readonly UserRole[] = [
  "subscriber",
  "contributor",
  "author",
  "editor",
  "admin",
];

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrator — full control",
  editor: "Editor — publish + edit any post",
  author: "Author — publish own posts",
  contributor: "Contributor — draft, no publish",
  subscriber: "Subscriber — read only",
};

// Client-side validation mirrors `userInviteInputSchema` on the server so
// the user gets instant feedback; the server remains the authoritative
// gate.
const inviteFormSchema = v.object({
  email: v.pipe(
    v.string(),
    v.trim(),
    v.email("Enter a valid email address"),
    v.maxLength(255),
  ),
  name: v.pipe(v.string(), v.trim(), v.maxLength(100)),
  role: v.picklist(USER_ROLES),
});

export const Route = createFileRoute("/_authenticated/users/new")({
  beforeLoad: ({ context }) => {
    // `user:create` is admin-only. Defense in depth — the sidebar button
    // is already gated on this cap but someone following a direct link
    // shouldn't land on a forbidden form.
    if (!context.user.capabilities.includes("user:create")) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/users", search: USERS_LIST_DEFAULT_SEARCH });
    }
  },
  component: InviteUserRoute,
});

// State machine. We render one of three views: the form, a submitting
// spinner (implicit via the form's isSubmitting), or the success screen
// with the shareable URL. `success` is a discriminated payload so React
// doesn't have to juggle two separate optional pieces of state.
type ViewState =
  | { status: "idle" }
  | { status: "success"; user: User; inviteUrl: string };

function InviteUserRoute(): ReactNode {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>({ status: "idle" });
  const [serverError, setServerError] = useState<string | null>(null);

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
    defaultValues: { email: "", name: "", role: "subscriber" as UserRole },
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(inviteFormSchema, value);
        return result.success ? undefined : result.issues[0].message;
      },
    },
    onSubmit: ({ value }) => {
      inviteUser.mutate(value);
    },
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
        <ArrowLeft className="size-4" />
        Back to users
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 data-testid="invite-heading">Invite user</h1>
          </CardTitle>
          <CardDescription>
            They'll enrol a passkey the first time they open the invite link. No
            password required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.Field
              name="email"
              validators={{
                onBlur: ({ value }) => {
                  const result = v.safeParse(
                    inviteFormSchema.entries.email,
                    value,
                  );
                  return result.success ? undefined : result.issues[0].message;
                },
              }}
            >
              {(field) => (
                <FormField
                  field={field}
                  label="Email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={inviteUser.isPending}
                  data-testid="invite-email-input"
                />
              )}
            </form.Field>

            <form.Field name="name">
              {(field) => (
                <FormField
                  field={field}
                  label={
                    <>
                      Name{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </>
                  }
                  type="text"
                  autoComplete="name"
                  disabled={inviteUser.isPending}
                  data-testid="invite-name-input"
                />
              )}
            </form.Field>

            <form.Field name="role">
              {(field) => (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="role">Role</Label>
                  <select
                    id="role"
                    name="role"
                    value={field.state.value}
                    onChange={(e) => {
                      field.handleChange(e.target.value as UserRole);
                    }}
                    disabled={inviteUser.isPending}
                    data-testid="invite-role-select"
                    className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {USER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </form.Field>

            {serverError ? (
              <Alert variant="destructive" data-testid="invite-server-error">
                <AlertDescription>{serverError}</AlertDescription>
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
                Cancel
              </Button>
              <form.Subscribe selector={(state) => state.canSubmit}>
                {(canSubmit) => (
                  <Button
                    type="submit"
                    disabled={!canSubmit || inviteUser.isPending}
                    data-testid="invite-submit"
                  >
                    {inviteUser.isPending ? "Inviting…" : "Send invite"}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// Build the shareable URL for the invite. Absolute so the admin can copy
// and paste into an email client without post-processing. Relies on the
// SPA being served at `ADMIN_BASE_PATH` — the accept-invite route under
// `/_auth/accept-invite/$token` consumes the token query when opened.
function buildInviteUrl(token: string): string {
  if (typeof window === "undefined") {
    // SSR / Node test harness — fall back to a path-only URL. The admin
    // is client-rendered in practice so this branch is a safety net.
    return `${ADMIN_BASE_PATH}/accept-invite/${token}`;
  }
  return `${window.location.origin}${ADMIN_BASE_PATH}/accept-invite/${token}`;
}

// Surface server-side errors with a human-friendly message where we can.
// The RPC layer throws with `.data.reason` on CONFLICT — everything else
// falls through as a generic "try again".
function mapInviteError(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { reason?: string } }).data;
    if (data?.reason === "email_taken") {
      return "A user with that email already exists.";
    }
  }
  if (err instanceof Error) return err.message;
  return "Couldn't send invite. Try again.";
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
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      // Two seconds is the shortest interval where a "Copied!" label
      // registers as intentional feedback rather than a flicker.
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // Clipboard API can be denied in some contexts (non-HTTPS, iframes).
      // Fall back silently — the URL is still visible + selectable.
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 data-testid="invite-success-heading">Invite ready</h1>
          </CardTitle>
          <CardDescription>
            Share the link below with {user.email}. They'll enrol a passkey the
            first time they open it. Link expires in 7 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-url">Invite link</Label>
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
                aria-label="Copy invite link"
              >
                {copied ? (
                  <>
                    <Check />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy />
                    <span>Copy</span>
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
              Invite another
            </Button>
            <Button
              type="button"
              onClick={onBackToList}
              data-testid="invite-done-button"
            >
              Back to users
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
