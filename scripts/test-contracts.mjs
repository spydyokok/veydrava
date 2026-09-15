import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
const platform =
  process.platform === "darwin"
    ? "darwin"
    : process.platform === "linux"
      ? "linux"
      : null;
const arch = process.arch === "arm64" ? "arm64" : "amd64";
const binary = resolve(
  `node_modules/@foundry-rs/forge-${platform}-${arch}/bin/forge`,
);
if (!platform || !existsSync(binary))
  throw new Error("Use Linux, macOS or WSL and run npm ci first.");
const result = spawnSync(
  binary,
  ["test", "--use", "./scripts/solc-wrapper.cjs", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
