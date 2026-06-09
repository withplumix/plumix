import type { HookRegistry } from "../hooks/registry.js";
import { entriesSearchHandler } from "./entries-handler.js";
import { termsSearchHandler } from "./terms-handler.js";
import { usersSearchHandler } from "./users-handler.js";

/**
 * Register core's built-in `admin:search:results` domains. Called at app
 * boot alongside the other core hook registrations. Plugins register
 * their own domains (or replace these) via the same filter.
 */
export function registerCoreSearchHandlers(hooks: HookRegistry): void {
  hooks.addFilter("admin:search:results", entriesSearchHandler, {
    priority: 10,
  });
  hooks.addFilter("admin:search:results", termsSearchHandler, {
    priority: 20,
  });
  hooks.addFilter("admin:search:results", usersSearchHandler, {
    priority: 30,
  });
}
