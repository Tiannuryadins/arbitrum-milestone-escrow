# Milestone — Trustless freelance escrow on Arbitrum Sepolia

Freelance escrow without the middleman. A client locks payment in a smart contract before work starts;
the freelancer submits proof of work per milestone; payment releases on approval — or a neutral
arbitrator resolves disputes. No platform fees, no frozen payouts, no trust required.

Built for the **Arbitrum Open House Dubai: Online Buildathon** (HackQuest). Testnet only — no real funds.

## Live demo

- **Demo site:** https://tiannuryadins.github.io/arbitrum-milestone-escrow/ (GitHub Pages — enable after repo creation)
- **Contract (Arbitrum Sepolia):** _pending deployment — deployer wallet awaits testnet ETH (see BUILD-TRANSCRIPT.md)_
- **Explorer:** https://sepolia.arbiscan.io/

## How it works

1. **Fund** — the client creates an escrow and locks ETH up front.
2. **Milestones** — work is split into priced milestones; each milestone's ETH is reserved on-chain.
3. **Submit** — the freelancer attaches proof of work (URL / IPFS CID).
4. **Release** — the client approves and ETH pays out instantly.
5. **Dispute** — either side can dispute a submitted milestone; the arbitrator (set at creation, optional)
   resolves it by paying the freelancer or refunding the client.

Safety properties: no admin keys (the deployer has no special powers after deployment), milestone
amounts are reserved at creation so the contract can never promise more than it holds, all ETH movement
is push-only to the recorded client/freelancer addresses, and every payout function uses
checks-effects-interactions plus a reentrancy guard.

## Repo layout

| Path | What it is |
|---|---|
| `contracts/MilestoneEscrow.sol` | The escrow contract (Solidity 0.8.30, zero dependencies) |
| `scripts/compile.js` | Compiles the contract → `app/contract.json` (ABI + bytecode) |
| `scripts/test-local.js` | Full E2E test on local anvil — **40/40 checks pass** |
| `scripts/deploy.js` | Deploys to local anvil or Arbitrum Sepolia → `app/deployment.json` |
| `scripts/bridge.js` | Bridges L1 Sepolia ETH → Arbitrum Sepolia (official Inbox) |
| `scripts/check-status.sh` | Re-queries the HackQuest API for the buildathon's open/closed status |
| `index.html`, `app.js`, `styles.css` | Static demo site (vanilla JS + ethers v6 via CDN) |
| `app/contract.json` | Compiled artifact used by the frontend (incl. in-app deploy) |
| `BUILD-TRANSCRIPT.md` | What was built, what was verified live, honest limitations |
| `SUBMISSION.md` | Submission draft for HackQuest (title, description, demo script, monitoring) |

## Run locally

```bash
npm install
node scripts/compile.js

# E2E test (needs anvil from Foundry):
anvil --port 8545            # in one terminal
node scripts/test-local.js   # 40 checks, deploy + full escrow lifecycle + reverts
node scripts/deploy.js local # deploys to anvil, writes app/deployment.json

# Demo site:
python3 -m http.server 8000  # open http://localhost:8000
```

## Deploy to Arbitrum Sepolia

```bash
# 1. Fund the deployer wallet (testnet-only throwaway key in
#    ~/.config/arbitrum-dubai-deployer.key) with Sepolia ETH from a faucet,
#    then bridge it:
node scripts/bridge.js 0.05   # L1 Sepolia -> Arbitrum Sepolia, ~15 min
# 2. Deploy:
node scripts/deploy.js arbitrum-sepolia
# 3. Commit the generated app/deployment.json so the demo site picks it up.
```

## Why Arbitrum

Freelance escrow means many small on-chain actions (create, milestone, submit, approve, dispute) —
exactly the workload where Arbitrum's low fees matter. A full escrow lifecycle costs a fraction of a
cent in gas on Arbitrum Sepolia, versus dollars on L1. The contract is plain Solidity (Stylus was
considered and rejected: it adds toolchain risk for a contract that needs no WASM performance).

## Status

- Contract: written, compiled (6,606 bytes bytecode), E2E-tested 40/40 on local chain.
- Demo site: complete; in-app deploy included so anyone can deploy from their own wallet.
- Arbitrum Sepolia deployment: **pending** — deployer wallet has 0 ETH; every faucet path needs a
  browser (captcha / Cloudflare / account). See BUILD-TRANSCRIPT.md § Blockers.
- Hackathon: registration **not open yet** (HackQuest API, checked 17 Nov 2026) — this repo is
  submission-ready for when it opens.

## License

MIT.
