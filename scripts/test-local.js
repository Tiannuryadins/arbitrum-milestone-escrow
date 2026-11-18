// Full E2E test of MilestoneEscrow on a local anvil chain.
//   1. start anvil:  anvil --port 8545   (separate terminal / background)
//   2. run:          node scripts/test-local.js
// Uses anvil's deterministic accounts: #0 client/deployer, #1 freelancer,
// #2 arbitrator, #3 stranger. Every check prints PASS/FAIL; exit code 1 on any failure.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..");
const ARTIFACT = JSON.parse(fs.readFileSync(path.join(ROOT, "app", "contract.json"), "utf8"));

const RPC = "http://127.0.0.1:8545";
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // #0 client
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // #1 freelancer
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // #2 arbitrator
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // #3 stranger
];

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}${extra ? " — " + extra : ""}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`);
  }
}
async function expectRevert(name, promise) {
  try {
    await promise;
    check(name + " (expected revert)", false, "tx did not revert");
  } catch (e) {
    check(name + " (expected revert)", true, String(e.message || e).slice(0, 90));
  }
}


async function doTx(promise) {
  const t = await promise;
  const rc = await t.wait();
  if (rc.status !== 1) throw new Error("tx reverted on-chain: " + t.hash);
  return rc;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const [client, freelancer, arbitrator, stranger] = KEYS.map((k) => new ethers.Wallet(k, provider));
  console.log(`client     ${client.address}`);
  console.log(`freelancer ${freelancer.address}`);
  console.log(`arbitrator ${arbitrator.address}`);

  // --- deploy ---
  const factory = new ethers.ContractFactory(ARTIFACT.abi, ARTIFACT.bytecode, client);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`deployed at ${addr}`);
  check("deploy: contract has code", (await provider.getCode(addr)) !== "0x");
  check("deploy: escrowCount starts at 0", (await contract.escrowCount()) === 0n);

  // --- create escrow: 1.0 ETH funded ---
  const cClient = contract.connect(client);
  const cFreelancer = contract.connect(freelancer);
  const cArb = contract.connect(arbitrator);
  const cStranger = contract.connect(stranger);

  await expectRevert("createEscrow with 0 value", cClient.createEscrow(freelancer.address, arbitrator.address, { value: 0 }));
  await expectRevert("createEscrow to self", cClient.createEscrow(client.address, arbitrator.address, { value: 1 }));
  await expectRevert("createEscrow to zero address", cClient.createEscrow(ethers.ZeroAddress, arbitrator.address, { value: 1 }));

  const txCreate = await cClient.createEscrow(freelancer.address, arbitrator.address, { value: ethers.parseEther("1.0") });
  const rcCreate = await txCreate.wait();
  check("createEscrow mines", rcCreate.status === 1);
  check("escrowCount is 1", (await contract.escrowCount()) === 1n);
  const esc0 = await contract.getEscrow(0);
  check("escrow fields", esc0.client === client.address && esc0.freelancer === freelancer.address && esc0.arbitrator === arbitrator.address);
  check("escrow funded 1.0", esc0.funded === ethers.parseEther("1.0"));
  check("escrow status Active(0)", esc0.status === 0n);
  check("unreserved 1.0", (await contract.unreservedBalance(0)) === ethers.parseEther("1.0"));
  const evCreated = rcCreate.logs.map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "EscrowCreated");
  check("EscrowCreated event", !!evCreated && evCreated.args.escrowId === 0n);

  // --- milestones ---
  await expectRevert("addMilestone by non-client", cFreelancer.addMilestone(0, "X", ethers.parseEther("0.1")));
  await expectRevert("addMilestone over budget", cClient.addMilestone(0, "Too big", ethers.parseEther("1.5")));
  await expectRevert("addMilestone zero amount", cClient.addMilestone(0, "Zero", 0));
  await doTx(cClient.addMilestone(0, "Design homepage mockup", ethers.parseEther("0.3")));
  await doTx(cClient.addMilestone(0, "Build landing page", ethers.parseEther("0.5")));
  check("unreserved after reserving 0.8", (await contract.unreservedBalance(0)) === ethers.parseEther("0.2"));
  const m0 = await contract.getMilestone(0, 0);
  check("milestone 0 fields", m0.description === "Design homepage mockup" && m0.amount === ethers.parseEther("0.3") && m0.status === 0n);

  // --- submit + approve milestone 0 ---
  await expectRevert("submitWork by non-freelancer", cClient.submitWork(0, 0, "ipfs://proof"));
  await expectRevert("approve before submit", cClient.approveMilestone(0, 0));
  await doTx(cFreelancer.submitWork(0, 0, "ipfs://QmDesignProof123"));
  const m0sub = await contract.getMilestone(0, 0);
  check("milestone 0 Submitted(1) with proof", m0sub.status === 1n && m0sub.workProof === "ipfs://QmDesignProof123");
  await expectRevert("double submit", cFreelancer.submitWork(0, 0, "ipfs://again"));
  const balBefore = await provider.getBalance(freelancer.address); // after submitWork gas is paid
  const txApprove = await cClient.approveMilestone(0, 0);
  const rcApprove = await txApprove.wait();
  check("approve mines", rcApprove.status === 1);
  const balAfter = await provider.getBalance(freelancer.address);
  check("freelancer received 0.3 ETH", balAfter - balBefore === ethers.parseEther("0.3"));
  const m0rel = await contract.getMilestone(0, 0);
  check("milestone 0 Released(2)", m0rel.status === 2n);
  const esc0b = await contract.getEscrow(0);
  check("escrow released 0.3, reserved 0.5", esc0b.released === ethers.parseEther("0.3") && esc0b.reserved === ethers.parseEther("0.5"));

  // --- dispute + arbitrator resolves to freelancer (milestone 1) ---
  await doTx(cFreelancer.submitWork(0, 1, "https://example.com/work.zip"));
  await expectRevert("dispute by stranger", cStranger.disputeMilestone(0, 1));
  await doTx(cClient.disputeMilestone(0, 1));
  const m1d = await contract.getMilestone(0, 1);
  check("milestone 1 Disputed(3)", m1d.status === 3n);
  await expectRevert("approve while disputed", cClient.approveMilestone(0, 1));
  await expectRevert("resolve by non-arbitrator", cClient.resolveDispute(0, 1, true));
  const balBefore2 = await provider.getBalance(freelancer.address);
  await doTx(cArb.resolveDispute(0, 1, true));
  const balAfter2 = await provider.getBalance(freelancer.address);
  check("arbitrator release pays 0.5 ETH", balAfter2 - balBefore2 === ethers.parseEther("0.5"));
  const m1r = await contract.getMilestone(0, 1);
  check("milestone 1 Released after dispute", m1r.status === 2n);

  // --- cancel blocked while reserved; refund path on a second escrow ---
  const txCreate2 = await cClient.createEscrow(freelancer.address, ethers.ZeroAddress, { value: ethers.parseEther("0.4") });
  await txCreate2.wait();
  await doTx(cClient.addMilestone(1, "Blocked cancel test", ethers.parseEther("0.1")));
  await expectRevert("cancel with open milestone", cClient.cancelEscrow(1));
  // dispute + no arbitrator => resolve must fail
  await doTx(cFreelancer.submitWork(1, 0, "ipfs://proof2"));
  await doTx(cClient.disputeMilestone(1, 0));
  await expectRevert("resolve with zero arbitrator", cArb.resolveDispute(1, 0, false));

  // third escrow: clean cancel refunds everything
  const balClientBefore = await provider.getBalance(client.address);
  const txCreate3 = await cClient.createEscrow(freelancer.address, arbitrator.address, { value: ethers.parseEther("0.25") });
  const rc3 = await txCreate3.wait();
  const gasCreate3 = rc3.gasUsed * rc3.gasPrice;
  const txCancel = await cClient.cancelEscrow(2);
  const rcCancel = await txCancel.wait();
  const gasCancel = rcCancel.gasUsed * rcCancel.gasPrice;
  const balClientAfter = await provider.getBalance(client.address);
  const netOut = balClientBefore - balClientAfter - gasCreate3 - gasCancel;
  check("cancel refunds full 0.25 ETH", netOut === 0n, `net out ${ethers.formatEther(netOut)}`);
  const esc2 = await contract.getEscrow(2);
  check("escrow 2 Cancelled(2)", esc2.status === 2n);
  await expectRevert("addMilestone on cancelled escrow", cClient.addMilestone(2, "Nope", 1));

  // --- addFunds ---
  await doTx(cClient.addFunds(0, { value: ethers.parseEther("0.1") }));
  check("addFunds tops up", (await contract.getEscrow(0)).funded === ethers.parseEther("1.1"));
  await expectRevert("addFunds by non-client", cFreelancer.addFunds(0, { value: 1 }));

  // --- event query (what the frontend uses) ---
  const createdEvents = await contract.queryFilter(contract.filters.EscrowCreated, 0, "latest");
  check("queryFilter finds 3 EscrowCreated", createdEvents.length === 3);
  const releasedEvents = await contract.queryFilter(contract.filters.MilestoneReleased, 0, "latest");
  check("queryFilter finds 1 MilestoneReleased", releasedEvents.length === 1);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error("test crashed:", e);
  process.exit(1);
});
