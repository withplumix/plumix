import type { PlumixApp } from "./app.js";

// env/ctx are runtime-specific; `any` keeps adapter-returned handlers
// bivariantly assignable to this core-level contract without losing
// Request/Response typing at the boundary.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type FetchHandler = (
  request: Request,
  env: any,
  ctx: any,
) => Response | Promise<Response>;

export interface ScheduledEvent {
  readonly scheduledTime: number;
  readonly cron: string;
}

export type ScheduledHandler = (
  event: ScheduledEvent,
  env: any,
  ctx: any,
) => void | Promise<void>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface CommandContext {
  readonly app: PlumixApp;
  readonly cwd: string;
  readonly configPath: string;
  readonly argv: readonly string[];
}

export interface CommandDefinition {
  readonly describe: string;
  run(ctx: CommandContext): Promise<void> | void;
}

export type CommandRegistry = Readonly<Record<string, CommandDefinition>>;

export interface RuntimeAdapter {
  readonly name: string;
  buildFetchHandler(app: PlumixApp): FetchHandler;
  buildScheduledHandler?(app: PlumixApp): ScheduledHandler;
  /**
   * Module specifier imported by the CLI to load runtime-contributed
   * commands. Kept out of the worker-facing adapter so dev/build/deploy
   * tooling never ends up in the worker bundle.
   */
  readonly commandsModule?: string;
}
