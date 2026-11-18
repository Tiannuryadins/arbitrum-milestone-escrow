// Compile contracts/MilestoneEscrow.sol with solc-js.
// Output: app/contract.json (ABI + bytecode, used by the frontend and deploy scripts).
// evmVersion Shanghai: the default Osaka target emits opcodes some local
// test chains reject (learned on the sibling Base Sepolia build).
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "contracts", "MilestoneEscrow.sol");
const OUT = path.join(ROOT, "app", "contract.json");

const input = {
  language: "Solidity",
  sources: { "MilestoneEscrow.sol": { content: fs.readFileSync(SRC, "utf8") } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "shanghai",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((e) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
for (const w of (output.errors || []).filter((e) => e.severity === "warning")) {
  console.warn("warning:", w.formattedMessage.split("\n")[0]);
}

const contract = output.contracts["MilestoneEscrow.sol"]["MilestoneEscrow"];
const artifact = {
  contractName: "MilestoneEscrow",
  compiler: "solc " + solc.version(),
  evmVersion: "shanghai",
  abi: contract.abi,
  bytecode: "0x" + contract.evm.bytecode.object,
  deployedBytecode: "0x" + contract.evm.deployedBytecode.object,
  bytecodeBytes: contract.evm.bytecode.object.length / 2,
};
fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
console.log(`compiled MilestoneEscrow: ${artifact.bytecodeBytes} bytes bytecode, ${artifact.abi.length} ABI entries -> ${OUT}`);
