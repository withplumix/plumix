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
import { extractReason } from "@/lib/orpc-errors.js";
import { orpc } from "@/lib/orpc.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import * as v from "valibot";

const formSchema = v.object({
  to: v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.email("Enter a valid email address."),
  ),
});

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
  const [feedback, setFeedback] = useState<
    { kind: "ok"; to: string } | { kind: "error"; message: string } | null
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
      setFeedback({ kind: "error", message: formatTestSendError(err) });
    },
  });

  const onSubmit = form.handleSubmit((value) => {
    testSend.mutate({ to: value.to });
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold" data-testid="mailer-heading">
          Mailer
        </h1>
        <p className="text-muted-foreground text-sm">
          Test that the configured outbound-email transport actually delivers.
          Used by magic-link sign-in, invite emails, and any plugin that opts
          into the shared mailer.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Send a test message</CardTitle>
          <CardDescription>
            Sends a one-off message via the same transport magic-link uses.
            Failures surface here verbatim — distinct from the magic-link
            request flow, which intentionally swallows mailer errors so the
            response shape can't leak whether an email is registered.
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
                    <FormLabel>Recipient</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="ops@example.com"
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
                    Test message sent to {feedback.to}. If it doesn't arrive
                    within a minute, check your transport adapter's logs.
                  </AlertDescription>
                </Alert>
              ) : null}
              {feedback?.kind === "error" ? (
                <Alert variant="destructive" data-testid="mailer-test-error">
                  <AlertDescription>{feedback.message}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={testSend.isPending}
                  data-testid="mailer-test-submit"
                >
                  {testSend.isPending ? "Sending…" : "Send test"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

function formatTestSendError(err: unknown): string {
  const reason = extractReason(err);
  if (reason === "mailer_not_configured") {
    return (
      "No mailer adapter is configured. Pass a `mailer:` to `plumix({...})` " +
      "(e.g. consoleMailer() for dev, or your Resend/Postmark/SES wrapper)."
    );
  }
  if (reason === "mailer_send_failed") {
    return (
      "The mailer adapter threw an error during send. Check the worker logs " +
      "for the underlying error."
    );
  }
  if (err instanceof Error) return err.message;
  return "Couldn't send the test message. Try again.";
}
