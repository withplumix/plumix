import { entries } from "plumix/schema";

export async function publish(ctx: { db: Db }, id: number): Promise<void> {
  await ctx.db.update(entries).set({ status: "published" }).where(id);
}
