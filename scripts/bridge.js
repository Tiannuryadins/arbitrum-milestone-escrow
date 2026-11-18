// Bridge L1 Sepolia ETH -> Arbitrum Sepolia via the official Inbox contract.
// Run AFTER claiming Sepolia ETH from a faucet (e.g. the pk910 PoW faucet,
// which needs a browser + captcha solve — see BUILD-TRANSCRIPT.md).
//   node scripts/bridge.js <amountEth>   (default 0.05)
// The deposit creates a retryable ticket that auto-redeems on L2; funds
// typically arrive on Arbitrum Sepolia within ~15 minutes.
// Arbitrum Sepolia L1 contracts (Ethereum Sepolia):
//   Delayed Inbox: 0xaAe29B0366299461418F5324a79Afc425BE5ae21 (verified, see below)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ethers } = require("ethers");

// Arbitrum Sepolia Inbox on Ethereum Sepolia — VERIFIED 17 Nov 2026 from
// Arbitrum docs (useful-addresses: Delayed Inbox 0xaAe2...ae21) and
// sepolia.etherscan.io/address/0xaAe29B0366299461418F5324a79Afc425BE5ae21
// (1.3M txs, recent "Deposit Eth" calls). The script also checks it has code.
const INBOX = "0xaAe29B0366299461418F5324a79Afc425BE5ae21";
const INBOX_ABI = [
  "function depositEth() payable returns (uint256)",
];

const L1_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const L2_RPC = "https://arbitrum-sepolia-rpc.publicnode.com";
const KEY_FILE = path.join(os.homedir(), ".config", "arbitrum-dubai-deployer.key");

async function main() {
  const amountEth = process.argv[2] || "0.05";
  const key = fs.readFileSync(KEY_FILE, "utf8").trim();
  const l1 = new ethers.JsonRpcProvider(L1_RPC);
  const wallet = new ethers.Wallet(key, l1);

  const code = await l1.getCode(INBOX);
  if (code === "0x") throw new Error(`Inbox ${INBOX} has no code on Sepolia — address wrong, aborting`);

  const balance = await l1.getBalance(wallet.address);
  const amount = ethers.parseEther(amountEth);
  console.log(`wallet:   ${wallet.address}`);
  console.log(`L1 bal:   ${ethers.formatEther(balance)} SepETH`);
  console.log(`bridging: ${amountEth} SepETH -> Arbitrum Sepolia`);
  if (balance <= amount) throw new Error("insufficient L1 balance (need amount + L1 gas)");

  const inbox = new ethers.Contract(INBOX, INBOX_ABI, wallet);
  const tx = await inbox.depositEth({ value: amount });
  console.log(`bridge tx: ${tx.hash}`);
  console.log(`track: https://sepolia.etherscan.io/tx/${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`confirmed in L1 block ${receipt.blockNumber}. L2 funds arrive after auto-redeem (~15 min).`);
  console.log(`check L2 balance: cast balance ${wallet.address} --rpc-url ${L2_RPC}`);
}

main().catch((e) => {
  console.error("bridge failed:", e.message || e);
  process.exit(1);
});
