import { list as activityList } from "./activity.js";
import { create } from "./create.js";
import { discardDraft } from "./discard-draft.js";
import { get } from "./get.js";
import { list } from "./list.js";
import { publish } from "./publish.js";
import { revisionsRouter } from "./revisions.js";
import { trash } from "./trash.js";
import { update } from "./update.js";

export const entryRouter = {
  list,
  get,
  create,
  update,
  trash,
  publish,
  discardDraft,
  revisions: revisionsRouter,
  activity: { list: activityList },
} as const;

export type EntryRouter = typeof entryRouter;
