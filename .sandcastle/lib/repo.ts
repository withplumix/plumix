import { join } from "node:path";

export const REPO_ROOT = join(import.meta.dirname, "..", "..");
export const REPO_SLUG = "withplumix/plumix";
export const MERGE_BASE = "origin/main";
export const READY_LABEL = "ready-for-agent";
export const TRIAGE_LABEL = "needs-triage";
export const WONTFIX_LABEL = "wontfix";
