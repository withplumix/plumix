import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function App(): React.ReactNode {
  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Plumix Admin</CardTitle>
          <CardDescription>Shell scaffold — no features yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Tailwind v4 + shadcn/ui are wired. Router, Query, and oRPC land in
            the next commit.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
