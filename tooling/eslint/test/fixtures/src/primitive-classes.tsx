import { Button, Card, CardContent, Field } from "@plumix/admin-ui";

export const spacedContainers = (
  <Card>
    <CardContent className="gap-4">
      <Field className="gap-y-1">x</Field>
    </CardContent>
  </Card>
);
export const spacedCard = <Card className="gap-4">x</Card>;
export const dynamic = (tint: string) => <Button className={tint}>x</Button>;
