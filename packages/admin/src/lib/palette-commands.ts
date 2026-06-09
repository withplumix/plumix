import type { useNavigate } from "@tanstack/react-router";

import type { Label } from "@plumix/core/i18n";
import type { CoreIconName } from "@plumix/core/manifest";

import { hasCap } from "./caps.js";
import { AdminPluginRegistryError } from "./errors.js";

export interface PaletteCommandContext {
  readonly navigate: ReturnType<typeof useNavigate>;
}

/** An executable command-palette entry (distinct from search results and
 *  manifest navigation). `capability` gates client-side visibility only. */
export interface PaletteCommand {
  readonly id: string;
  readonly title: Label;
  readonly keywords?: readonly string[];
  readonly coreIcon?: CoreIconName;
  readonly capability?: string;
  readonly run: (ctx: PaletteCommandContext) => void;
}

const registered = new Map<string, PaletteCommand>();

/** Register a command. Plugins call this from their admin chunk via
 *  `window.plumix.registerPaletteCommand`. */
export function registerPaletteCommand(command: PaletteCommand): void {
  if (registered.has(command.id)) {
    throw AdminPluginRegistryError.duplicateKey({
      registerName: "registerPaletteCommand",
      key: command.id,
    });
  }
  registered.set(command.id, command);
}

export function getRegisteredPaletteCommands(): readonly PaletteCommand[] {
  return [...registered.values()];
}

/** @internal Test-only. */
export function _resetPaletteCommands(): void {
  registered.clear();
}

/** `toText` is the caller's i18n-bound `Label` resolver; capability
 *  gating mirrors the sidebar's. */
export function selectCommands(
  commands: readonly PaletteCommand[],
  capabilities: readonly string[],
  query: string,
  toText: (label: Label) => string,
): readonly PaletteCommand[] {
  const needle = query.trim().toLowerCase();
  return commands.filter((command) => {
    if (command.capability && !hasCap(capabilities, command.capability)) {
      return false;
    }
    if (needle.length === 0) return true;
    const haystack = [toText(command.title), ...(command.keywords ?? [])].join(
      " ",
    );
    return haystack.toLowerCase().includes(needle);
  });
}
