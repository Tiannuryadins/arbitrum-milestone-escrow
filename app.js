// Milestone demo frontend — vanilla JS + ethers v6 (ESM via CDN).
// Reads app/contract.json (ABI + bytecode) and app/deployment.json (live address).
// If no deployment exists yet, the UI offers an in-app deploy from the user's wallet.
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.5/+esm";

const ARB_SEPOLIA = {
  chainId: 421614,
  chainIdHex: "0x66eee",
  chainName: "Arbitrum Sepolia",
  rpcUrls: ["https://arbitrum-sepolia-rpc.publicnode.com"],
  blockExplorerUrls: ["https://sepolia.arbiscan.io"],
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

const ESCROW_STATUS = ["Active", "Completed", "Cancelled"];
const MILESTONE_STATUS = ["Pending", "Submitted", "Released", "Disputed", "Refunded"];

let artifact = null;
let deployment = null;
let provider = null; // BrowserProvider
let readProvider = null; // read-only fallback (public RPC)
let signer = null;
let account = null;
let contract = null; // connected (signer) contract, when deployed

const $ = (id) => document.getElementById(id);
const toastEl = $("toast");
let toastTimer = null;
function toast(msg, ms = 6000) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), ms);
}
function short(addr) {
  return addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : "—";
}
function esc(link, text) {
  const a = document.createElement("a");
  a.href = link;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  return a;
}

async function loadJson(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

async function init() {
  try {
    artifact = await loadJson("app/contract.json");
  } catch (e) {
    toast("Could not load app/contract.json — the app cannot run. " + e.message);
    return;
  }
  try {
    deployment = await loadJson("app/deployment.json");
  } catch {
    deployment = null; // not deployed yet — show deploy banner
  }
  readProvider = new ethers.JsonRpcProvider(ARB_SEPOLIA.rpcUrls[0]);

  if (deployment && deployment.address) {
    $("deployBanner").classList.add("hidden");
    $("contractCard").classList.remove("hidden");
    $("contractAddr").textContent = deployment.address;
    $("contractLink").href = `https://sepolia.arbiscan.io/address/${deployment.address}`;
  } else {
    $("deployBanner").classList.remove("hidden");
  }

  $("connectBtn").addEventListener("click", connectWallet);
  $("refreshBtn").addEventListener("click", listEscrows);
  $("deployBtn").addEventListener("click", deployFromBrowser);
  $("createForm").addEventListener("submit", onCreate);
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => window.location.reload());
    window.ethereum.on("chainChanged", () => window.location.reload());
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    toast("No injected wallet found — install MetaMask (or another EVM wallet) and try again.");
    return;
  }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    account = await signer.getAddress();
    await ensureNetwork();
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== ARB_SEPOLIA.chainId) {
      $("netBadge").textContent = "wrong network";
      $("netBadge").className = "badge bad";
      toast("Please switch to Arbitrum Sepolia (chainId 421614).");
      return;
    }
    $("netBadge").textContent = "Arbitrum Sepolia · " + short(account);
    $("netBadge").className = "badge ok";
    $("connectBtn").textContent = short(account);
    if (deployment) {
      contract = new ethers.Contract(deployment.address, artifact.abi, signer);
    }
    await listEscrows();
  } catch (e) {
    toast("Wallet connection failed: " + (e.message || e));
  }
}

async function ensureNetwork() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARB_SEPOLIA.chainIdHex }],
    });
  } catch (e) {
    if (e.code === 4902) {
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [ARB_SEPOLIA] });
    } else {
      throw e;
    }
  }
}

async function deployFromBrowser() {
  if (!signer) {
    toast("Connect your wallet first, then deploy.");
    await connectWallet();
    if (!signer) return;
  }
  $("deployStatus").textContent = "Deploying… confirm the transaction in your wallet.";
  $("deployBtn").disabled = true;
  try {
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
    const c = await factory.deploy();
    $("deployStatus").textContent = "Deploy tx sent: " + c.deploymentTransaction().hash + " — waiting for confirmation…";
    await c.waitForDeployment();
    const address = await c.getAddress();
    deployment = { network: "arbitrum-sepolia", chainId: 421614, address, deployTx: c.deploymentTransaction().hash };
    contract = new ethers.Contract(address, artifact.abi, signer);
    $("deployStatus").textContent = "Deployed at " + address + ". Save this address into app/deployment.json so everyone sees it.";
    $("deployBanner").classList.add("hidden");
    $("contractCard").classList.remove("hidden");
    $("contractAddr").textContent = address;
    $("contractLink").href = `https://sepolia.arbiscan.io/address/${address}`;
    toast("Contract deployed at " + address);
    await listEscrows();
  } catch (e) {
    $("deployStatus").textContent = "Deploy failed: " + (e.message || e);
  } finally {
    $("deployBtn").disabled = false;
  }
}

async function onCreate(e) {
  e.preventDefault();
  if (!contract) {
    toast("Contract is not deployed yet — deploy it first (button above).");
    return;
  }
  const freelancer = $("freelancerInput").value.trim();
  const arbitratorRaw = $("arbitratorInput").value.trim();
  const fund = $("fundInput").value;
  if (!ethers.isAddress(freelancer)) return toast("Freelancer address is not valid.");
  const arbitrator = arbitratorRaw ? arbitratorRaw : ethers.ZeroAddress;
  if (!ethers.isAddress(arbitrator)) return toast("Arbitrator address is not valid.");
  $("createStatus").textContent = "Sending… confirm in your wallet.";
  try {
    const tx = await contract.createEscrow(freelancer, arbitrator, { value: ethers.parseEther(fund) });
    $("createStatus").textContent = "Tx sent: " + tx.hash + " — waiting…";
    const rc = await tx.wait();
    $("createStatus").textContent = `Escrow created (block ${rc.blockNumber}).`;
    toast("Escrow created!");
    await listEscrows();
  } catch (err) {
    $("createStatus").textContent = "Failed: " + (err.reason || err.message || err);
  }
}

function readContract() {
  if (!deployment) return null;
  return new ethers.Contract(deployment.address, artifact.abi, readProvider);
}

async function listEscrows() {
  const list = $("escrowList");
  if (!deployment) {
    list.innerHTML = "<p class='muted'>Contract not deployed yet — nothing to list.</p>";
    return;
  }
  if (!account) {
    list.innerHTML = "<p class='muted'>Connect your wallet to see escrows.</p>";
    return;
  }
  list.innerHTML = "<p class='muted'>Loading escrows from Arbitrum Sepolia…</p>";
  try {
    const rc = readContract();
    const [asClient, asFreelancer] = await Promise.all([
      rc.queryFilter(rc.filters.EscrowCreated(null, account, null), 0, "latest"),
      rc.queryFilter(rc.filters.EscrowCreated(null, null, account), 0, "latest"),
    ]);
    const ids = [...new Set([...asClient, ...asFreelancer].map((e) => Number(e.args.escrowId)))].sort((a, b) => b - a);
    if (!ids.length) {
      list.innerHTML = "<p class='muted'>No escrows yet for this wallet. Create one above.</p>";
      return;
    }
    list.innerHTML = "";
    for (const id of ids) {
      list.appendChild(await renderEscrow(rc, id));
    }
  } catch (e) {
    list.innerHTML = `<p class='muted'>Failed to load escrows: ${e.message || e}</p>`;
  }
}

async function renderEscrow(rc, id) {
  const e = await rc.getEscrow(id);
  const div = document.createElement("div");
  div.className = "escrow";
  const role = account.toLowerCase() === e.client.toLowerCase() ? "client" : "freelancer";
  const h = document.createElement("h3");
  h.textContent = `Escrow #${id} — ${ESCROW_STATUS[e.status]} (you are ${role})`;
  div.appendChild(h);

  const dl = document.createElement("dl");
  dl.className = "kv";
  const rows = [
    ["Client", e.client],
    ["Freelancer", e.freelancer],
    ["Arbitrator", e.arbitrator === ethers.ZeroAddress ? "(none)" : e.arbitrator],
    ["Funded", ethers.formatEther(e.funded) + " ETH"],
    ["Released", ethers.formatEther(e.released) + " ETH"],
    ["Reserved", ethers.formatEther(e.reserved) + " ETH"],
    ["Unreserved", ethers.formatEther(await rc.unreservedBalance(id)) + " ETH"],
    ["Created", new Date(Number(e.createdAt) * 1000).toLocaleString()],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    dl.append(dt, dd);
  }
  div.appendChild(dl);

  // milestones
  const count = Number(e.milestoneCount);
  for (let m = 0; m < count; m++) {
    div.appendChild(await renderMilestone(rc, id, m, e, role));
  }

  // client actions: add milestone / add funds / cancel
  if (role === "client" && e.status === 0n) {
    const form = document.createElement("div");
    form.className = "inline-form";
    const desc = document.createElement("input");
    desc.placeholder = "New milestone description";
    const amt = document.createElement("input");
    amt.type = "number";
    amt.step = "0.001";
    amt.min = "0.001";
    amt.placeholder = "ETH amount";
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Add milestone";
    btn.addEventListener("click", async () => {
      if (!desc.value.trim() || !amt.value) return toast("Description and amount are required.");
      await sendTx(() => contract.addMilestone(id, desc.value.trim(), ethers.parseEther(amt.value)), "Milestone added");
    });
    const fundBtn = document.createElement("button");
    fundBtn.className = "btn";
    fundBtn.textContent = "+ Add 0.05 ETH funds";
    fundBtn.addEventListener("click", async () => {
      await sendTx(() => contract.addFunds(id, { value: ethers.parseEther("0.05") }), "Funds added");
    });
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn danger";
    cancelBtn.textContent = "Cancel escrow (refund unreserved)";
    cancelBtn.addEventListener("click", async () => {
      if (!confirm("Cancel escrow #" + id + " and refund all unreserved ETH? (Blocked while milestones are open.)")) return;
      await sendTx(() => contract.cancelEscrow(id), "Escrow cancelled, funds refunded");
    });
    form.append(desc, amt, btn, fundBtn, cancelBtn);
    div.appendChild(form);
  }
  return div;
}

async function renderMilestone(rc, escrowId, milestoneId, escrow, role) {
  const m = await rc.getMilestone(escrowId, milestoneId);
  const div = document.createElement("div");
  div.className = "milestone";
  const status = MILESTONE_STATUS[m.status];
  const title = document.createElement("div");
  title.innerHTML = `<b>Milestone #${milestoneId}</b> — ${escapeHtml(m.description)} · <b>${ethers.formatEther(m.amount)} ETH</b> · <span class="status ${status}">${status}</span>`;
  div.appendChild(title);
  if (m.workProof) {
    const p = document.createElement("div");
    p.className = "small";
    p.textContent = "Proof: ";
    const link = /^https?:\/\//.test(m.workProof)
      ? esc(m.workProof, m.workProof)
      : document.createTextNode(m.workProof);
    p.appendChild(link);
    div.appendChild(p);
  }
  const actions = document.createElement("div");
  actions.className = "actions";

  if (role === "freelancer" && m.status === 0n && escrow.status === 0n) {
    const proof = document.createElement("input");
    proof.placeholder = "Proof link (URL / IPFS CID)";
    proof.style.flex = "1";
    const btn = document.createElement("button");
    btn.className = "btn primary";
    btn.textContent = "Submit work";
    btn.addEventListener("click", async () => {
      if (!proof.value.trim()) return toast("Add a proof link first.");
      await sendTx(() => contract.submitWork(escrowId, milestoneId, proof.value.trim()), "Work submitted");
    });
    actions.append(proof, btn);
  }
  if (role === "client" && m.status === 1n) {
    const btn = document.createElement("button");
    btn.className = "btn primary";
    btn.textContent = "Approve & release payment";
    btn.addEventListener("click", async () => {
      await sendTx(() => contract.approveMilestone(escrowId, milestoneId), "Payment released");
    });
    actions.appendChild(btn);
  }
  if (m.status === 1n && escrow.status === 0n) {
    const btn = document.createElement("button");
    btn.className = "btn danger";
    btn.textContent = "Dispute";
    btn.addEventListener("click", async () => {
      await sendTx(() => contract.disputeMilestone(escrowId, milestoneId), "Milestone disputed");
    });
    actions.appendChild(btn);
  }
  if (m.status === 3n && account.toLowerCase() === escrow.arbitrator.toLowerCase()) {
    const payBtn = document.createElement("button");
    payBtn.className = "btn primary";
    payBtn.textContent = "Resolve: pay freelancer";
    payBtn.addEventListener("click", async () => {
      await sendTx(() => contract.resolveDispute(escrowId, milestoneId, true), "Dispute resolved — freelancer paid");
    });
    const refBtn = document.createElement("button");
    refBtn.className = "btn danger";
    refBtn.textContent = "Resolve: refund client";
    refBtn.addEventListener("click", async () => {
      await sendTx(() => contract.resolveDispute(escrowId, milestoneId, false), "Dispute resolved — client refunded");
    });
    actions.append(payBtn, refBtn);
  }
  if (actions.children.length) div.appendChild(actions);
  return div;
}

async function sendTx(fn, okMsg) {
  if (!contract) return toast("Contract is not deployed yet.");
  try {
    const tx = await fn();
    toast("Transaction sent: " + tx.hash.slice(0, 18) + "… — waiting for confirmation");
    await tx.wait();
    toast(okMsg);
    await listEscrows();
  } catch (e) {
    toast("Transaction failed: " + (e.reason || e.message || e));
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

init();
