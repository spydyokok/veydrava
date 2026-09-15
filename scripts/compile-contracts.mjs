import solc from "solc";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const names = ["VeydravaVault", "TestUSD"];
const sources = Object.fromEntries(
  names.map((n) => [
    `contracts/src/${n}.sol`,
    { content: readFileSync(`contracts/src/${n}.sol`, "utf8") },
  ]),
);
const input = {
  language: "Solidity",
  sources,
  settings: {
    evmVersion: "cancun",
    optimizer: { enabled: true, runs: 200 },
    metadata: { bytecodeHash: "none" },
    outputSelection: {
      "*": {
        "*": [
          "abi",
          "evm.bytecode.object",
          "evm.deployedBytecode.object",
          "metadata",
        ],
      },
    },
  },
};
const output = JSON.parse(
  solc.compile(JSON.stringify(input), {
    import: (p) => {
      try {
        return { contents: readFileSync(resolve("node_modules", p), "utf8") };
      } catch {
        return { error: `Import unavailable: ${p}` };
      }
    },
  }),
);
for (const e of output.errors ?? []) console.error(e.formattedMessage);
if ((output.errors ?? []).some((e) => e.severity === "error")) process.exit(1);
mkdirSync("lib/veydrava/artifacts", { recursive: true });
for (const n of names) {
  const c = output.contracts[`contracts/src/${n}.sol`][n];
  const a = {
    contractName: n,
    compiler: solc.version(),
    abi: c.abi,
    bytecode: `0x${c.evm.bytecode.object}`,
    deployedBytecode: `0x${c.evm.deployedBytecode.object}`,
  };
  writeFileSync(
    `lib/veydrava/artifacts/${n}.json`,
    JSON.stringify(a, null, 2) + "\n",
  );
  console.log(
    `${n}: compiled (${c.evm.deployedBytecode.object.length / 2} runtime bytes)`,
  );
}
mkdirSync("contracts/build", { recursive: true });
writeFileSync(
  "contracts/build/compiler-input.json",
  JSON.stringify(input, null, 2),
);
