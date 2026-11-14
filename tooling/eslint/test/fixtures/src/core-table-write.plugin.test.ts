import { entries } from "plumix/schema";

export async function seed(db: Db): Promise<void> {
  await db.insert(entries).values({ type: "post" });
}
