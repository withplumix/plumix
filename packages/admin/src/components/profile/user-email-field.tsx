import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
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
import { toDate } from "@/lib/dates.js";
import { extractCode, extractReason } from "@/lib/orpc-errors.js";
import { orpc } from "@/lib/orpc.js";
import { useFormatters } from "@/lib/use-formatters.js";
import { useLabel } from "@/lib/use-label.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { defineMessage } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import * as v from "valibot";

import type { Label } from "@plumix/core/i18n";
import { vMessage } from "@plumix/core/validation";

// Email field on the user-edit page. Three states:
//
//   1. No pending change → display the current email + a "Change
//      email" button (only when the caller can edit).
//   2. Pending change → show a banner with the new email + expiry +
//      a Cancel button. New change requests still work; the request
//      flow auto-purges the prior pending row before issuing.
//   3. Modal open → form to type the new email + submit.
//
// Self vs admin behaves identically — the server's per-procedure
// auth gate decides what's allowed. The UI just renders + dispatches.

const M = {
  invalidEmail: defineMessage({
    id: "userEdit.email.invalid",
    message: "Enter a valid email address.",
  }),
  // Confirmation success — formatted via `i18n._` so `{email}` can
  // interpolate dynamically.
  confirmationSent: defineMessage({
    id: "userEdit.email.confirmationSent",
    message:
      "Confirmation sent to {email}. The change takes effect once they click the link.",
  }),
  // Placeholder is locale-sensitive (some locales prefer a different
  // example domain). Resolved via `useLabel()` for the `placeholder`
  // attribute (string-only).
  newEmailPlaceholder: defineMessage({
    id: "userEdit.email.placeholder",
    message: "new@example.com",
  }),
  // Mutation error fallbacks.
  emailTaken: defineMessage({
    id: "userEdit.email.error.taken",
    message: "That email is already in use on another account.",
  }),
  mailerNotConfigured: defineMessage({
    id: "userEdit.email.error.mailerNotConfigured",
    message:
      "Email change requires a magic-link mailer to be configured server-side. Pass `auth.magicLink` and `mailer:` to `plumix({...})` to enable.",
  }),
  accountDisabled: defineMessage({
    id: "userEdit.email.error.accountDisabled",
    message: "This account is disabled.",
  }),
  requestFallback: defineMessage({
    id: "userEdit.email.error.requestFallback",
    message: "Couldn't request the change. Try again.",
  }),
} satisfies Record<string, MessageDescriptor>;

const formSchema = v.object({
  newEmail: v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.email(vMessage(M.invalidEmail)),
    v.maxLength(255),
  ),
});

export function UserEmailField({
  userId,
  email,
  canEdit,
}: {
  userId: number;
  email: string;
  canEdit: boolean;
}): ReactNode {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const { formatRelative } = useFormatters();
  const label = useLabel();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<Label | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const pendingQuery = useQuery(
    orpc.user.pendingEmailChange.queryOptions({ input: { id: userId } }),
  );
  const pending = pendingQuery.data?.pending ?? null;

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({
      queryKey: orpc.user.pendingEmailChange.key(),
    });

  const request = useMutation({
    mutationFn: (newEmail: string) =>
      orpc.user.requestEmailChange.call({ id: userId, newEmail }),
    onSuccess: async (_, newEmail) => {
      setOpen(false);
      setError(null);
      setSuccess(
        i18n._(
          M.confirmationSent.id,
          { email: newEmail },
          { message: M.confirmationSent.message },
        ),
      );
      await invalidate();
    },
    onError: (err) => {
      setError(formatRequestError(err));
    },
  });

  const cancel = useMutation({
    mutationFn: () => orpc.user.cancelEmailChange.call({ id: userId }),
    onSuccess: async () => {
      setSuccess(null);
      await invalidate();
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <UILabel>
        <Trans id="userEdit.email.label" message="Email" />
      </UILabel>
      <div className="flex flex-wrap items-center gap-2">
        <p
          className="text-muted-foreground font-mono text-sm"
          data-testid="user-edit-email"
        >
          {email}
        </p>
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setOpen(true);
            }}
            data-testid="user-edit-email-change-button"
          >
            <Trans id="userEdit.email.changeButton" message="Change email" />
          </Button>
        ) : null}
      </div>

      {/*
        Pending banner takes precedence over the post-mutation success
        alert: a successful request invalidates the pending query, so
        the next fetch surfaces the same in-flight state. Rendering
        both would briefly double-up between the mutation resolving
        and the refetch landing — pick the durable signal.
      */}
      {pending ? (
        <Alert data-testid="user-edit-email-pending">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>
              <Trans
                id="userEdit.email.pending"
                message="Pending change to <code>{newEmail}</code> — expires {expiresAt}"
                values={{
                  newEmail: pending.newEmail,
                  expiresAt: formatRelative(toDate(pending.expiresAt)),
                }}
                components={{ code: <code className="font-mono" /> }}
              />
            </span>
            {canEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
                data-testid="user-edit-email-cancel-pending"
              >
                {cancel.isPending ? (
                  <Trans
                    id="userEdit.email.cancelPending.pending"
                    message="Cancelling…"
                  />
                ) : (
                  <Trans
                    id="userEdit.email.cancelPending.idle"
                    message="Cancel"
                  />
                )}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : success ? (
        <Alert data-testid="user-edit-email-change-success">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <ChangeEmailDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setError(null);
          setOpen(next);
        }}
        currentEmail={email}
        onSubmit={(newEmail) => request.mutate(newEmail)}
        pending={request.isPending}
        error={error}
        placeholder={label(M.newEmailPlaceholder)}
      />
    </div>
  );
}

function ChangeEmailDialog({
  open,
  onOpenChange,
  currentEmail,
  onSubmit,
  pending,
  error,
  placeholder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail: string;
  onSubmit: (newEmail: string) => void;
  pending: boolean;
  error: Label | null;
  placeholder: string;
}): ReactNode {
  const label = useLabel();
  const form = useForm({
    resolver: valibotResolver(formSchema),
    defaultValues: { newEmail: "" },
    mode: "onSubmit",
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="user-edit-email-change-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans id="userEdit.email.dialog.title" message="Change email" />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans
              id="userEdit.email.dialog.description"
              message="We'll send a confirmation link to the new address. The change takes effect after the link is clicked. Sessions on this account are signed out at that point — re-sign-in uses the new email."
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-3"
            onSubmit={form.handleSubmit((values) => {
              onSubmit(values.newEmail);
            })}
          >
            <div className="flex flex-col gap-2">
              <UILabel className="text-muted-foreground text-xs">
                <Trans
                  id="userEdit.email.dialog.currentLabel"
                  message="Current email"
                />
              </UILabel>
              <p
                className="text-muted-foreground font-mono text-sm"
                data-testid="user-edit-email-change-current"
              >
                {currentEmail}
              </p>
            </div>
            <FormField
              control={form.control}
              name="newEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <Trans
                      id="userEdit.email.dialog.newLabel"
                      message="New email"
                    />
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder={placeholder}
                      disabled={pending}
                      data-testid="user-edit-email-change-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error ? (
              <Alert
                variant="destructive"
                data-testid="user-edit-email-change-error"
              >
                <AlertDescription>{label(error)}</AlertDescription>
              </Alert>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={pending}
                data-testid="user-edit-email-change-cancel"
              >
                <Trans id="userEdit.email.dialog.cancel" message="Cancel" />
              </AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                disabled={pending}
                data-testid="user-edit-email-change-submit"
              >
                {pending ? (
                  <Trans
                    id="userEdit.email.dialog.submit.pending"
                    message="Sending…"
                  />
                ) : (
                  <Trans
                    id="userEdit.email.dialog.submit.idle"
                    message="Send confirmation"
                  />
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function formatRequestError(err: unknown): Label {
  if (extractCode(err) === "CONFLICT") {
    const reason = extractReason(err);
    if (reason === "email_taken") return M.emailTaken;
    if (reason === "mailer_not_configured") return M.mailerNotConfigured;
    if (reason === "account_disabled") return M.accountDisabled;
  }
  if (err instanceof Error) return err.message;
  return M.requestFallback;
}
