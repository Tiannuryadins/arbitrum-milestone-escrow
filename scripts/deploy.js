// Deploy MilestoneEscrow.
//   node scripts/deploy.js local          -> anvil at http://127.0.0.1:8545 (test key #0)
//   node scripts/deploy.js arbitrum-sepolia -> Arbitrum Sepolia (needs funded deployer key)
// Deployer key: ~/.config/arbitrum-dubai-deployer.key (testnet-only throwaway, mode 600).
// Writes the deployed address to app/deployment.json (read by the frontend).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..");
const ARTIFACT = JSON.parse(fs.readFileSync(path.join(ROOT, "app", "contract.json"), "utf8"));

const NETWORKS = {
  local: {
    rpc: "http://127.0.0.1:8545",
    chainId: 31337,
    key: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // anvil #0
  },
  "arbitrum-sepolia": {
    rpc: "https://arbitrum-sepolia-rpc.publicnode.com",
    fallbackRpc: "https://arbitrum-sepolia.drpc.org",
    chainId: 421614,
    keyFile: path.join(os.homedir(), ".config", "arbitrum-dubai-deployer.key"),
  },
};

async function main() {
  const net = process.argv[2] || "local";
  const cfg = NETWORKS[net];
  if (!cfg) throw new Error(`unknown network: ${net} (local | arbitrum-sepolia)`);

  let key = cfg.key;
  if (cfg.keyFile) {
    if (!fs.existsSync(cfg.keyFile)) throw new Error(`deployer key not found: ${cfg.keyFile}`);
    key = fs.readFileSync(cfg.keyFile, "utf8").trim();
  }

  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  const chainId = Number(await provider.getNetwork().then((n) => n.chainId));
  if (chainId !== cfg.chainId) throw new Error(`chainId mismatch: got ${chainId}, want ${cfg.chainId}`);

  const wallet = new ethers.Wallet(key, provider);
  const balance = await provider.getBalance(wallet.address);
  console.log(`deployer: ${wallet.address}`);
  console.log(`balance:  ${ethers.formatEther(balance)} ETH`);
  if (balance === 0n) throw new Error("deployer has 0 ETH — fund it first (see scripts/bridge.js / faucet notes in BUILD-TRANSCRIPT.md)");

  const factory = new ethers.ContractFactory(ARTIFACT.abi, ARTIFACT.bytecode, wallet);
  const contract = await factory.deploy();
  console.log(`deploy tx: ${contract.deploymentTransaction().hash}`);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const receipt = await contract.deploymentTransaction().wait();
  console.log(`deployed MilestoneEscrow at ${address} (block ${receipt.blockNumber}, gas ${receipt.gasUsed})`);

  const deployment = {
    network: net,
    chainId: cfg.chainId,
    contractName: "MilestoneEscrow",
    address,
    deployTx: contract.deploymentTransaction().hash,
    deployer: wallet.address,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    deployedAt: new Date().toISOString(),
    explorer:
      net === "arbitrum-sepolia"
        ? `https://sepolia.arbiscan.io/address/${address}`
        : null,
  };
  fs.writeFileSync(path.join(ROOT, "app", "deployment.json"), JSON.stringify(deployment, null, 2));
  console.log("wrote app/deployment.json");
}

main().catch((e) => {
  console.error("deploy failed:", e.message || e);
  process.exit(1);
});
