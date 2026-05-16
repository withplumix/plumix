import { PluginContextError } from "../errors.js";

export function assertComponentRef(
  pluginId: string,
  descriptor: string,
  ref: unknown,
): void {
  if (typeof ref !== "string" || ref.length === 0) {
    throw PluginContextError.invalidComponentRef({ pluginId, descriptor });
  }
}
