import { get } from "./get.js";
import { upsert } from "./upsert.js";

export const settingsRouter = {
  get,
  upsert,
} as const;

export type SettingsRouter = typeof settingsRouter;
