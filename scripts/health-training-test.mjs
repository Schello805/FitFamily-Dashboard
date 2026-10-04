import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const result = spawnSync("python3", [fileURLToPath(new URL("./health-training-test.py", import.meta.url)), ...process.argv.slice(2)], { stdio: "inherit" });
if (result.error) console.error("Python 3 mit zoneinfo wird benötigt (Python 3.9 oder neuer).", result.error.message);
process.exit(result.status ?? 1);
