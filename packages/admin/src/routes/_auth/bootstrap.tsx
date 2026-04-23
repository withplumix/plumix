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
import { registerWithPasskey } from "@/lib/passkey.js";
import { SESSION_QUERY_KEY, sessionQueryOptions } from "@/lib/session.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useForm } from "react-hook-form";

import { bootstrapSchema } from "./-schemas.js";

export const Route = createFileRoute("/_auth/bootstrap")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(),
    );
    if (!session.needsBootstrap) {
      // Once someone's claimed the bootstrap slot, /bootstrap becomes /login
      // to avoid dead-end UX; the server would reject a post-bootstrap
      // registration attempt with `registration_closed` regardless.
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/login" });
    }
  },
  component: BootstrapRoute,
});

function BootstrapRoute(): ReactNode {
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const createAccount = useMutation({
    mutationFn: registerWithPasskey,
    onMutate: () => setErrorCode(null),
    onSuccess: async () => {
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
    resolver: valibotResolver(bootstrapSchema),
    defaultValues: { email: "", name: "" },
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((value) => {
    createAccount.mutate({
      email: value.email,
      ...(value.name ? { name: value.name } : {}),
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 data-testid="bootstrap-heading">Create admin account</h1>
        </CardTitle>
        <CardDescription>
          Set up your site — this email becomes the admin account.
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
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="username webauthn"
                      required
                      disabled={createAccount.isPending}
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
                    Name{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      autoComplete="name"
                      disabled={createAccount.isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {errorCode ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {getPasskeyErrorMessage(errorCode)}
                </AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={createAccount.isPending}>
              {createAccount.isPending
                ? "Creating account…"
                : "Create account with passkey"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
