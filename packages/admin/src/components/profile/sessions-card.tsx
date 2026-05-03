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
import { orpc } from "@/lib/orpc.js";
import { useMutation } from "@tanstack/react-query";

export function SessionsCard(): ReactNode {
  const [feedback, setFeedback] = useState<
    { kind: "ok"; revoked: number } | { kind: "error"; message: string } | null
  >(null);

  const revokeOthers = useMutation({
    mutationFn: () => orpc.auth.sessions.revokeOthers.call({}),
    onMutate: () => {
      setFeedback(null);
    },
    onSuccess: (result) => {
      setFeedback({ kind: "ok", revoked: result.revoked });
    },
    onError: (err) => {
      setFeedback({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Couldn't revoke sessions. Try again.",
      });
    },
  });

  return (
    <Card data-testid="profile-sessions-card">
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>
          Sign out everywhere except this browser. Use this if you suspect a
          device has been lost or your session was used somewhere unexpected.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {feedback?.kind === "ok" ? (
          <Alert data-testid="profile-sessions-feedback">
            <AlertDescription>
              {feedback.revoked === 0
                ? "No other sessions to sign out."
                : feedback.revoked === 1
                  ? "Signed out 1 other session."
                  : `Signed out ${feedback.revoked} other sessions.`}
            </AlertDescription>
          </Alert>
        ) : null}
        {feedback?.kind === "error" ? (
          <Alert variant="destructive" data-testid="profile-sessions-error">
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              revokeOthers.mutate();
            }}
            disabled={revokeOthers.isPending}
            data-testid="profile-sessions-revoke-button"
          >
            {revokeOthers.isPending ? "Signing out…" : "Sign out other devices"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
