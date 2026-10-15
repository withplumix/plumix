/** Cmd+K on macOS, Ctrl+K elsewhere. */
export function isPaletteToggleKey(event: {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
}): boolean {
  return event.key === "k" && (event.metaKey || event.ctrlKey);
}
