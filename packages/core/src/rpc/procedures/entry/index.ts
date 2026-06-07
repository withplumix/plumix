import { list as activityList } from "./activity.js";
import { deletePermanentMany, restoreMany, trashMany } from "./bulk.js";
import { create } from "./create.js";
import { recentActivity, stats } from "./dashboard.js";
import { deletePermanent } from "./delete-permanent.js";
import { discardDraft } from "./discard-draft.js";
import { duplicate } from "./duplicate.js";
import { get } from "./get.js";
import { list } from "./list.js";
import { publish } from "./publish.js";
import { restore } from "./restore.js";
import { revisionsRouter } from "./revisions.js";
import { trash } from "./trash.js";
import { update } from "./update.js";

export const entryRouter = {
  list,
  get,
  create,
  update,
  trash,
  restore,
  deletePermanent,
  trashMany,
  restoreMany,
  deletePermanentMany,
  duplicate,
  publish,
  discardDraft,
  stats,
  recentActivity,
  revisions: revisionsRouter,
  activity: { list: activityList },
} as const;

export type EntryRouter = typeof entryRouter;
