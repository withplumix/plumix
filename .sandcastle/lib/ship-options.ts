import { parseArgs } from "node:util";

export interface ShipOptions {
  readonly onlyTickets: readonly number[];
  readonly lanes: number;
  readonly budgetMs: number;
}

type ShipCommand =
  | ({ readonly mode: "run"; readonly verbose: boolean } & ShipOptions)
  | {
      readonly mode: "status" | "report" | "drain" | "help";
      readonly verbose: boolean;
    }
  | {
      readonly mode: "explain";
      readonly issue: number;
      readonly verbose: boolean;
    };

export function readShipCommand(args: readonly string[]): ShipCommand {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: {
      lanes: { type: "string" },
      hours: { type: "string" },
      verbose: { type: "boolean" },
      status: { type: "boolean" },
      report: { type: "boolean" },
      drain: { type: "boolean" },
      help: { type: "boolean" },
      explain: { type: "string" },
    },
  });
  const modes = (
    ["status", "report", "drain", "help", "explain"] as const
  ).filter((mode) => values[mode] !== undefined && values[mode] !== false);
  if (modes.length > 1) throw new Error("Choose one operator command");
  const verbose = values.verbose ?? false;
  const positive = (text: string, name: string, integer: boolean): number => {
    const number = Number(text);
    if (
      !Number.isFinite(number) ||
      number <= 0 ||
      (integer && !Number.isSafeInteger(number))
    )
      throw new Error(
        `${name} must be a positive ${integer ? "integer" : "number"}`,
      );
    return number;
  };
  const mode = modes[0];
  if (mode) {
    if (positionals.length || values.lanes || values.hours)
      throw new Error("Delivery options cannot accompany an operator command");
    return mode === "explain"
      ? { mode, verbose, issue: positive(values.explain!, "issue", true) }
      : { mode, verbose };
  }
  return {
    mode: "run",
    verbose,
    onlyTickets: positionals.map((issue) => positive(issue, "issue", true)),
    lanes: positive(values.lanes ?? "2", "lanes", true),
    budgetMs: positive(values.hours ?? "8", "hours", false) * 3_600_000,
  };
}
