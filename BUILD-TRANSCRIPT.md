# BUILD-TRANSCRIPT — Milestone (Arbitrum Dubai Buildathon, persiapan)

**Built:** Tuesday 17 Nov 2026, ~07:30–09:30 WIB, by an AI agent working solo.
**Event:** Arbitrum Open House Dubai: Online Buildathon (HackQuest). **Status at build time: registration
NOT OPEN** — this is preparation only; nothing was registered or submitted.
**Track/theme:** DeFi / payments tooling — trustless freelance milestone escrow.
**Status:** app complete and E2E-tested; **Arbitrum Sepolia deployment PENDING testnet ETH** (faucet step
needs a browser); submission drafts ready for the human steps (HackQuest account + register + submit
once the event opens).

## What was built

- **Concept: Milestone** — trustless freelance milestone escrow. A client funds an escrow in ETH up front;
  work is split into priced milestones; the freelancer submits proof of work (URL/IPFS CID); the client
  approves and ETH releases instantly; either side can dispute and a neutral arbitrator resolves.
  Distinct from the sibling builds in progress (make.fun best-game-01 game, X Layer TapeOut, Base Stocks
  Maxxing stock agent, Firebase HybridAI, Kiroween, Aevum).
- **Smart contract** (`contracts/MilestoneEscrow.sol`): Solidity 0.8.30, zero dependencies, 6,606 bytes
  bytecode, 33 ABI entries. Functions: `createEscrow`, `addFunds`, `addMilestone`, `submitWork`,
  `approveMilestone`, `disputeMilestone`, `resolveDispute`, `cancelEscrow`, plus views
  (`getEscrow`, `getMilestone`, `unreservedBalance`, `escrowCount`). Safety: no admin keys, milestone
  amounts reserved at creation, push-only payouts to recorded addresses, checks-effects-interactions +
  reentrancy guard on all ETH-moving functions, cancellation blocked while milestones are open.
- **Scripts** (`scripts/`): `compile.js` (solc-js, evmVersion Shanghai), `test-local.js` (E2E on anvil),
  `deploy.js` (local + Arbitrum Sepolia, writes `app/deployment.json`), `bridge.js` (L1 Sepolia →
  Arbitrum Sepolia via the official Delayed Inbox), `check-status.sh` (HackQuest status re-query).
- **Demo site** (`index.html`, `app.js`, `styles.css`, `app/contract.json`): static site for GitHub Pages.
  Connect wallet (MetaMask), auto-switch to Arbitrum Sepolia, create escrow, list "my escrows" (event
  scan), add milestones, submit work, approve/release, dispute, arbitrator resolve, cancel/refund.
  Includes an **in-app Deploy button** so anyone can deploy the contract from their own wallet if the
  project deploy hasn't landed yet. Honest "not deployed yet" banner until `app/deployment.json` exists.
- **Deployer wallet** (testnet-only throwaway): `0x5660d00793F3B9F413965F0fa5Dc9585E8cF37E1`;
  key at `~/.config/arbitrum-dubai-deployer.key`, mode 600, NOT in repo.

## Verified live (not assumed)

| Claim | Evidence |
|---|---|
| Event still NOT OPEN | HackQuest GraphQL `FindUniqueHackathon` (17 Nov ~07:30 & ~09:30 WIB): `currentStatus: [REGISTER_NOT_OPEN, SUBMIT_NOT_OPEN, VOTE_NOT_OPEN, USER_NOT_REGISTER]`, `totalRewards: "30000"`, `participants: 90`, `rewardTime: 2031-02-13` (placeholder, unchanged) |
| Arbitrum Sepolia RPC live | `eth_chainId` → `0x66eee` (421614) on `https://arbitrum-sepolia-rpc.publicnode.com` and `https://arbitrum-sepolia.drpc.org`; `cast block-number` → 329,941,885. Official `sepolia-rollup.arbitrum.io` times out via this VM's egress proxy — publicnode/dRPC are the working endpoints |
| Ethereum Sepolia RPC live | `eth_blockNumber` on `https://ethereum-sepolia-rpc.publicnode.com` → block 0xb96910 |
| Contract compiles | solc 0.8.30, 6,606 bytes bytecode, 0 errors |
| Full E2E on local chain | `node scripts/test-local.js` → **40/40 checks passed, 2 consecutive runs**: deploy, create (incl. 0-value/self/zero-address reverts), milestones (over-budget/zero/non-client reverts), submit + approve with exact 0.3 ETH payout, dispute + arbitrator release of 0.5 ETH, cancel blocked while reserved, zero-arbitrator resolve revert, clean cancel refunds exactly 0.25 ETH, addFunds, event queries (3 EscrowCreated, 1 MilestoneReleased) |
| Deploy script works | `node scripts/deploy.js local` → deployed at `0x998abeb3E57409262aE5b751f60747921B33613E`, gas 1,496,787, `app/deployment.json` written (local file removed afterwards so the repo ships clean) |
| Bridge target verified | Arbitrum Sepolia Delayed Inbox `0xaAe29B0366299461418F5324a79Afc425BE5ae21` — from Arbitrum docs (useful-addresses) + sepolia.etherscan.io (1.3M txs, "Deposit Eth" calls within the last hours) |
| Static app serves | `python3 -m http.server`: `/`, `/app.js`, `/styles.css`, `/app/contract.json` all HTTP 200; `node --check` on `app.js` OK |
| Monitoring script works | `scripts/check-status.sh` returns the live HackQuest record (see row 1) |
| Stack choice | Solidity chosen over Stylus: Stylus (Rust/WASM) adds toolchain risk for a contract that needs no WASM performance; Solidity + Sepolia is the documented happy path |

## Blockers / honest limitations

1. **Contract is NOT deployed on Arbitrum Sepolia yet.** Deployer wallet balance is 0 ETH. Every faucet
   path needs a browser: pk910 PoW faucet requires its custom captcha before `startSession`
   (`captcha.requiredForStart: true` in its own config; the API POST also times out from this VM),
   Chainlink + QuickNode faucets sit behind Cloudflare, Alchemy/Google Cloud need accounts. The agent has
   no live-browser access. Unblocks via: (a) a browser task claiming a faucet for
   `0x5660d00793F3B9F413965F0fa5Dc9585E8cF37E1` (pk910: solve captcha, mine CryptoNight until ≥0.05 ETH,
   claim; or any direct Arbitrum Sepolia faucet), then `node scripts/bridge.js 0.05` (if L1 Sepolia ETH)
   and `node scripts/deploy.js arbitrum-sepolia`; or (b) the user deploying from the app's own "Deploy
   contract" button with their wallet. Until then the demo site shows "contract not deployed yet" and
   escrow actions are disabled by design.
2. **GitHub repo / Pages:** see § GitHub below (attempted via connector; outcome recorded there).
3. **No real browser run of the UI.** Syntax + static serving verified; the full click-through (wallet
   connect, MetaMask signing) has not been exercised in a real browser. The demo-video recording step
   will exercise it.
4. **Event dates unconfirmed.** The 6 Dec 2026 deadline claimed by aggregators is NOT verified in any
   official source; the official record still shows 2030 placeholders. Do not present 6 Dec as certain.
5. **Traction is zero.** No users, no onchain usage yet. Stated openly in the app and submission draft.
6. **No audit.** The contract is small and tested, but unaudited — testnet only, and the submission says so.

## GitHub

- Intended repo: `Tiannuryadins/arbitrum-milestone-escrow` (public), Pages from `main` root.
- **Repo creation FAILED via connector (17 Nov ~09:50 WIB):** `create_repository` was approved by the
  user but GitHub returned `403 Resource not accessible by integration` — the Muse GitHub App token
  cannot create repositories under the user account. Verified afterwards: 0 repos match
  `arbitrum-milestone-escrow user:Tiannuryadins`. This is a connector permission limit, not an approval
  problem; retrying the same call will fail the same way.
- **Unblock (browser/human step):** create the empty public repo `arbitrum-milestone-escrow` in the
  GitHub web UI (no README/license/gitignore — the snapshot includes them), install the Muse GitHub App
  on it (same flow as the make.fun repos), then run the prepared snapshot push:
  `github push-files --owner Tiannuryadins --repo arbitrum-milestone-escrow --branch main --message "Milestone: trustless freelance escrow on Arbitrum Sepolia" --source-dir ~/workspace/arbitrum-dubai --paths-file ~/workspace/arbitrum-dubai-paths.txt`
  (17 files, 120,790 bytes; manifest at `~/workspace/arbitrum-dubai-paths.txt`, NUL-delimited, excludes
  `node_modules/`). Then enable GitHub Pages in repo Settings → Pages → Deploy from branch `main`,
  folder `/ (root)` (no MCP tool covers Pages setup — browser step). **Do not treat the demo URL as
  live until Pages is verified serving.**
- After the Sepolia deployment lands, re-push with the new `app/deployment.json` added to the manifest.

## Decisions

- **Why escrow, not another DeFi clone:** clear user value (freelancers lose money to non-payment;
  clients fear paying for undelivered work), a full state machine that demos well in 2 minutes, and a
  natural fit for Arbitrum's low-fee story (many small on-chain actions).
- **Why Solidity, not Stylus:** lower risk, faster verification, and the contract needs no WASM
  performance. Stylus would be a differentiator but a liability under a short, uncertain deadline.
- **Why push payouts (not pull):** simpler UX for the demo; reentrancy guard + CEI ordering make push
  safe here, and recipients are fixed addresses, not arbitrary contracts chosen at payout time.
- **Why the app blocks escrow actions until deployed:** an escrow UI that pretends to work without a
  contract would be fake. The banner + in-app deploy keep the demo honest.
