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
import { getPasskeyErrorMessage, PasskeyError } from "@/lib/passkey-errors.js";
import { acceptInviteWithPasskey } from "@/lib/passkey.js";
import { SESSION_QUERY_KEY, sessionQueryOptions } from "@/lib/session.js";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useForm } from "react-hook-form";

// The invite flow lands unauthenticated users here — any existing session
// is a red flag (you don't accept an invite while already signed in, and
// the token would bind a *different* user to your current browser). Kick
// them to the dashboard; if they want to switch accounts they can sign
// out first.
export const Route = createFileRoute("/_auth/accept-invite/$token")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(),
    );
    if (session.user) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/" });
    }
  },
  component: AcceptInviteRoute,
});

function AcceptInviteRoute(): ReactNode {
  const { token } = Route.useParams();
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: (input: { name?: string }) =>
      acceptInviteWithPasskey({
        token,
        ...(input.name ? { name: input.name } : {}),
      }),
    onMutate: () => {
      setErrorCode(null);
    },
    onSuccess: async () => {
      // Session cookie is set by the verify endpoint. Invalidate the
      // session query so the router's `_authenticated` guard sees the
      // new identity on the next navigation, then land on the dashboard.
      await router.options.context.queryClient.invalidateQueries({
        queryKey: SESSION_QUERY_KEY,
      });
      await router.navigate({ to: "/" });
    },
    onError: (err) => {
      setErrorCode(err instanceof PasskeyError ? err.code : "unknown");
    },
  });

  const form = useForm({
    defaultValues: { name: "" },
  });

  const onSubmit = form.handleSubmit((value) => {
    accept.mutate({ name: value.name || undefined });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 data-testid="accept-invite-heading">Accept your invite</h1>
        </CardTitle>
        <CardDescription>
          Set up a passkey to finish creating your account. Your browser or
          device will guide you through the prompt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      autoComplete="name"
                      disabled={accept.isPending}
                      data-testid="accept-invite-name-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {errorCode ? (
              <Alert variant="destructive" data-testid="accept-invite-error">
                <AlertDescription>
                  {getPasskeyErrorMessage(errorCode)}
                </AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              disabled={accept.isPending}
              data-testid="accept-invite-submit"
            >
              {accept.isPending ? "Setting up…" : "Create passkey"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
