# SUBMISSION DRAFT — Milestone (Arbitrum Open House Dubai: Online Buildathon)

**Status: DRAFT ONLY — DO NOT SUBMIT YET.** Registration is NOT OPEN per the official HackQuest API
(checked 17 Nov 2026). Submit only after registration opens and the team is accepted. The 6 Dec 2026
deadline claimed by aggregators is UNVERIFIED — confirm dates from HackQuest before relying on them.

## HackQuest registration form (fill when open)

- **Full name / team:** Januar (solo builder; built with AI assistance — disclose honestly, do not invent
  human teammates)
- **Location:** Indonesia
- **Project idea (≤300 chars):** `Milestone: trustless freelance escrow on Arbitrum Sepolia. Clients lock ETH per milestone, freelancers submit proof of work, payment releases on approval; a neutral arbitrator resolves disputes. No platform fees, no frozen payouts.`
- **Project website:** https://tiannuryadins.github.io/arbitrum-milestone-escrow/
- **Arbitrum One wallet (prizes):** `0xFa70a80736D74EBB9165C56e9B01EB78C892E7Cb` (user's EVM wallet — confirm with user before submitting)

## HackQuest submission form (fill when submissions open)

- **Title:** Milestone — Trustless Freelance Escrow on Arbitrum
- **MVP / Project Website (required):** https://tiannuryadins.github.io/arbitrum-milestone-escrow/
- **Contract Address:** _fill after Arbitrum Sepolia deployment_ (deployer `0x5660d00793F3B9F413965F0fa5Dc9585E8cF37E1`; see BUILD-TRANSCRIPT.md § Blockers)
- **Repo:** https://github.com/Tiannuryadins/arbitrum-milestone-escrow

## Description (for the submission / README pitch)

Freelancers lose income to clients who never pay; clients fear paying for work that never arrives.
Milestone removes the middleman: a client locks ETH in a smart contract before work starts, splits the
job into priced milestones, and each milestone pays out automatically when the client approves the
freelancer's submitted proof of work. If they disagree, a neutral arbitrator — chosen at escrow creation
— resolves the dispute on-chain. There are no platform fees, no frozen payouts, and no admin keys: the
deployer has no powers after deployment, and milestone funds are reserved on-chain so the contract can
never promise more than it holds.

Built on Arbitrum Sepolia because escrow means many small on-chain actions (create, milestone, submit,
approve, dispute) — exactly the workload where Arbitrum's low fees matter. A full escrow lifecycle costs
a fraction of a cent in gas.

**What works today:** full escrow lifecycle on a local chain (40/40 automated E2E checks), plus a
working demo site with wallet connect, escrow creation, milestone management, dispute + arbitration,
and in-app contract deployment. **Honest status:** testnet deployment is pending faucet funding; the
project has zero users so far and the contract is unaudited (testnet only).

## Demo script (2 minutes, for the video / judges)

1. (0:00–0:20) Open the demo site; connect MetaMask (Arbitrum Sepolia). Show the contract address on
   Arbiscan — deployed, verified on testnet.
2. (0:20–0:50) As the **client**: create an escrow for a freelancer address, fund 0.1 ETH, add two
   milestones ("Design mockup — 0.03 ETH", "Build landing page — 0.05 ETH"). Show the reserved balance.
3. (0:50–1:20) Switch to the **freelancer** wallet: submit work on milestone 1 with a proof link.
   Switch back to the client: approve → payment releases on-chain (show the tx + freelancer balance).
4. (1:20–1:50) Dispute milestone 2, then resolve as the **arbitrator** (refund the client). Show the
   final escrow state: released, refunded, and reserved amounts all reconcile.
5. (1:50–2:00) Close on the code: one Solidity file, zero dependencies, 40/40 E2E checks, MIT licensed.

## Judging criteria — self-assessment (honest)

- **Innovation:** medium — escrow is a known pattern; the differentiator is the milestone + arbitration
  state machine done cleanly with no admin keys. Do not oversell novelty.
- **Technical implementation:** strong — zero-dependency Solidity, reentrancy-guarded payouts, reserved
  funds invariant, 40/40 automated E2E checks, in-app deploy.
- **Use of Arbitrum technology:** good — native low-fee design rationale; Sepolia deployment (pending);
  plain Solidity (Stylus deliberately not used — see README).
- **Potential impact:** real but unproven — freelance non-payment is a genuine problem; zero traction so far.
- **Presentation quality:** demo site + repo + this draft; video still to record.

## Human steps required (cannot be done by the agent)

1. **Create a HackQuest account** (free, email/Google/GitHub) — user.
2. **Fund the deployer OR deploy from the demo site** (see BUILD-TRANSCRIPT.md § Blockers) — browser
   task or user. Until then the contract address field stays blank.
3. **Register** on HackQuest once `REGISTER_OPEN` (see Monitoring below) — user (account + identity).
4. **Submit** via the HackQuest form once `SUBMIT_OPEN` — user (or agent with a logged-in browser session).
5. **Record the 2-minute demo video** — user/agent with browser.
6. **If we win:** grant agreement + AML/KYC + mainnet launch + KPI — user (signature + identity).

## MONITORING — how to detect the opening

Run every 1–2 days (or via a cron) until registration opens:

```bash
bash ~/workspace/arbitrum-dubai/scripts/check-status.sh
# or the raw query:
# POST https://api.hackquest.io/graphql, operation FindUniqueHackathon,
# variables {"where":{"alias":"Arbitrum-Open-House-Dubai-Online-Buildathon"}}
```

Watch `currentStatus`:
- `REGISTER_NOT_OPEN` → still closed. `REGISTER_OPEN` → **registration is live: register immediately**
  (acceptance is at the organizer's discretion; earlier is better).
- `SUBMIT_NOT_OPEN` → submissions closed. `SUBMIT_OPEN` → **submit immediately** — the MVP is ready.
- Also watch `participants` (90 at last check) and `timeline.rewardTime` (placeholder 2031-02-13 until
  real dates appear) — any change from the placeholders means the event is being finalized.
- Cross-check the landing page https://arbitrum-dubai.hackquest.io/ ("Prize: Announcing Soon" → real
  tiers when finalized) and the event page
  https://www.hackquest.io/hackathons/Arbitrum-Open-House-Dubai-Online-Buildathon.

**If the aggregator deadline (6 Dec 2026) turns out to be real**, the window between opening and
submission close may be short — that is why this MVP was built before opening. The moment
`SUBMIT_OPEN` appears: (1) confirm the Sepolia deployment is live, (2) fill the contract address in
this draft, (3) submit.
