import { requestDrain } from "./lib/control.js";
import { configureLogging } from "./lib/log.js";
import { explainText, reportText, statusText } from "./lib/operations.js";
import { ShipHistory } from "./lib/ship-history.js";
import { readShipCommand } from "./lib/ship-options.js";

const command = readShipCommand(process.argv.slice(2));
const root = import.meta.dirname;
configureLogging(command.verbose);
if (command.mode === "help") {
  console.log(
    "ship [issue ...] [--lanes=2] [--hours=8] [--verbose]\nship --status | --report | --explain=ISSUE | --drain\nState and evidence are saved automatically under .sandcastle/runs/.",
  );
} else if (command.mode === "drain") {
  console.log(
    requestDrain(root)
      ? "Drain requested. Active work reaches its next checkpoint; unfinished deliveries remain resumable."
      : "No running coordinator in this checkout.",
  );
} else if (
  command.mode === "status" ||
  command.mode === "report" ||
  command.mode === "explain"
) {
  const history = new ShipHistory(root, "read");
  console.log(
    command.mode === "explain"
      ? explainText(history, command.issue)
      : command.mode === "report"
        ? reportText(history)
        : statusText(history),
  );
} else if (command.mode === "run") {
  const { runShip } = await import("./ship-run.js");
  await runShip(command);
}
