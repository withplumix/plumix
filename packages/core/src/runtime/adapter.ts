// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PlumixApp {}

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

export interface DevOpts {
  readonly port?: number;
}

export interface BuildOpts {
  readonly outdir?: string;
}

export interface BuildResult {
  readonly outputPath: string;
}

export interface DeployOpts {
  readonly production?: boolean;
}

export interface DeployResult {
  readonly url?: string;
}

export interface MigrateOpts {
  readonly apply?: boolean;
}

export interface RuntimeCli {
  dev(opts: DevOpts): Promise<void>;
  build(opts: BuildOpts): Promise<BuildResult>;
  deploy(opts: DeployOpts): Promise<DeployResult>;
  types(): Promise<void>;
  migrate(opts: MigrateOpts): Promise<void>;
}

export interface RuntimeAdapter {
  readonly name: string;
  buildFetchHandler(app: PlumixApp): FetchHandler;
  buildScheduledHandler?(app: PlumixApp): ScheduledHandler;
  readonly cli: RuntimeCli;
}
