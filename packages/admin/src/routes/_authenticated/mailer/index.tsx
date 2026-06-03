import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
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
import { hasCap } from "@/lib/caps.js";
import { testSendErrorMessage } from "@/lib/mailer-errors.js";
import { orpc } from "@/lib/orpc.js";
import { useLabel } from "@/lib/use-label.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import * as v from "valibot";

import type { Label } from "@plumix/core/i18n";
import { vMessage } from "@plumix/core/validation";

const formSchema = v.object({
  to: v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.email(
      vMessage(
        defineMessage({
          id: "mailer.test.recipient.invalid",
          message: "Enter a valid email address.",
        }),
      ),
    ),
  ),
});

const M = {
  placeholder: defineMessage({
    id: "mailer.test.recipient.placeholder",
    message: "ops@example.com",
  }),
} satisfies Record<string, MessageDescriptor>;

export const Route = createFileRoute("/_authenticated/mailer/")({
  beforeLoad: ({ context }) => {
    if (!hasCap(context.user.capabilities, "settings:manage")) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/" });
    }
  },
  component: MailerRoute,
});

function MailerRoute(): ReactNode {
  const { user } = Route.useRouteContext();
  const label = useLabel();
  const [feedback, setFeedback] = useState<
    { kind: "ok"; to: string } | { kind: "error"; message: Label } | null
  >(null);

  const form = useForm({
    resolver: valibotResolver(formSchema),
    defaultValues: { to: user.email },
    mode: "onBlur",
  });

  const testSend = useMutation({
    mutationFn: (input: { to: string }) =>
      orpc.auth.mailer.testSend.call(input),
    onMutate: () => {
      setFeedback(null);
    },
    onSuccess: (_, variables) => {
      setFeedback({ kind: "ok", to: variables.to });
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: testSendErrorMessage(err) });
    },
  });

  const onSubmit = form.handleSubmit((value) => {
    testSend.mutate({ to: value.to });
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold" data-testid="mailer-heading">
          <Trans id="mailer.title" message="Mailer" />
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans
            id="mailer.description"
            message="Test that the configured outbound-email transport actually delivers. Used by magic-link sign-in, invite emails, and any plugin that opts into the shared mailer."
          />
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            <Trans id="mailer.test.title" message="Send a test message" />
          </CardTitle>
          <CardDescription>
            <Trans
              id="mailer.test.description"
              message="Sends a one-off message via the same transport magic-link uses. Failures surface here verbatim — distinct from the magic-link request flow, which intentionally swallows mailer errors so the response shape can't leak whether an email is registered."
            />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <FormField
                control={form.control}
                name="to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Trans
                        id="mailer.test.recipient.label"
                        message="Recipient"
                      />
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder={label(M.placeholder)}
                        disabled={testSend.isPending}
                        data-testid="mailer-test-recipient"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {feedback?.kind === "ok" ? (
                <Alert data-testid="mailer-test-feedback">
                  <AlertDescription>
                    <Trans
                      id="mailer.test.feedback.ok"
                      message="Test message sent to {to}. If it doesn't arrive within a minute, check your transport adapter's logs."
                      values={{ to: feedback.to }}
                      comment="to: the recipient email address the test was sent to"
                    />
                  </AlertDescription>
                </Alert>
              ) : null}
              {feedback?.kind === "error" ? (
                <Alert variant="destructive" data-testid="mailer-test-error">
                  <AlertDescription>{label(feedback.message)}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={testSend.isPending}
                  data-testid="mailer-test-submit"
                >
                  {testSend.isPending ? (
                    <Trans id="mailer.test.submit.pending" message="Sending…" />
                  ) : (
                    <Trans id="mailer.test.submit.idle" message="Send test" />
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
