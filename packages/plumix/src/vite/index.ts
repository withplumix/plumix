export interface PlumixVitePluginOptions {
  readonly configFile?: string;
}

export function plumix(options: PlumixVitePluginOptions = {}) {
  return {
    name: "plumix",
    plumix: options,
  };
}
