import type { HookRegistry } from "../hooks/registry.js";
import { entriesSearchHandler } from "./entries-handler.js";

/**
 * Register core's built-in `admin:search:results` domains. Called at app
 * boot alongside the other core hook registrations. Plugins register
 * their own domains (or replace these) via the same filter.
 */
export function registerCoreSearchHandlers(hooks: HookRegistry): void {
  hooks.addFilter("admin:search:results", entriesSearchHandler, {
    priority: 10,
  });
}
