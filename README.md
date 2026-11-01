# ProphetSyndicate

**AI rebalanced prediction market liquidity syndicate and senior / junior tranche capital router for the ProphetGrid ecosystem.**

Liquidity providers fund a single custody vault in two tranches. GenLayer validators read a live
macro implied volatility print and the depth of the linked ProphetGrid market book, quantize both
onto a discrete 250 bps grid, and must agree exactly on one of four routing bands and on every wei
number that band produces. The band decides how much syndicate liquidity is routed into ProphetGrid
market making, how much stays inside the senior protection shield, and the tranche yield rates for
that epoch.

| | |
|---|---|
| Deployed intelligent contract (studionet, chain 61999) | `0x206bdF01A814e8ae27EbC4A7aC138995217B95F8` |
| Deploy transaction | `0x2ee35b6d60629b83d346790128611d5830ab26e0e272a2e3ab79a95afd637b37` |
| Deployed commit | `f8cff0a` (tag `studionet-v1`) |
| Explorer | <https://genlayer-explorer.vercel.app/contracts/0x206bdF01A814e8ae27EbC4A7aC138995217B95F8> |
| Live desk | <https://hoveiser.github.io/ProphetSyndicate/> |
| Linked ecosystem module | ProphetGrid `0xB0aeDBb6E8056c0a2c90E4BD901bB0f3DA6Bb967` |
| Contract source | `contracts/prophet_syndicate.py`, 36,560 bytes, sha256 `f25eff7c7e17f7db280d330597f60016daeab3564094371e4039d65d70f3ed8d`, pinned runner `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |
| Tests | 72 direct mode tests, `genvm-lint check` clean |
| Evidence | `evidence/studionet_deployment.json`, `docs/adversarial-review.md`, `docs/evidence.md` |

## What is actually on chain

The vault is funded with native GEN. Custody is split into buckets that always partition the
account balance exactly, and the contract proves it on chain:

```json
"checks": {
  "custody_partition_exact": true,
  "pst_backed_by_custody": true,
  "locked_principal_reserved": true
}
```

| Bucket | Meaning |
|---|---|
| `senior_principal_wei` | principal protected tranche, first claim on the yield pool |
| `junior_principal_wei` | high alpha market making sleeve, subordinate yield |
| `claimable_wei` | rejected value, released principal and settled yield, all claimable |
| `locked_bond_wei` | native routing bonds locked while an epoch is in flight |
| `yield_pool_wei` | the only source of yield: 25 bps entry fees plus audit bonds |

`get_custody_accounting_summary()` also reports the vault account balance read straight from the
chain node (`vm_account_balance_wei` in the view, `native_balance_of_vault_wei` in the evidence),
so the ledger is checkable against the account rather than taken on trust.

## The routing decision

Inside one `gl.nondet` leader function, storage is snapshotted into plain locals first, then two
live documents are fetched with `gl.nondet.web.render(url, mode="text")`:

* macro implied volatility, `https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX`
* linked ProphetGrid market depth, the ecosystem evidence file of the accepted ProphetGrid module

Both prints are quantized onto a 250 bps grid (`quantized_volatility_baseline_bps`,
`quantized_tail_risk_bps`) and the tail risk print selects one discrete band:

| Band | Tail risk corridor | Routed to ProphetGrid | Held in the senior shield |
|---|---|---|---|
| `HIGH_CONVICTION_DEPLOYMENT` | 0 to 2000 bps | 80 percent | 20 percent |
| `BALANCED_HEDGE_ALLOCATION` | 2250 to 5000 bps | 50 percent | 50 percent |
| `DEFENSIVE_COLLATERAL_BUFFER` | 5250 to 7500 bps | 20 percent | 80 percent |
| `CORRELATION_FREEZE_WITHDRAWAL` | above 7500 bps | 0 percent | 100 percent, penalty free redemption |

`gl.eq_principle.prompt_comparative` requires 100 percent agreement on all seven consensus fields
(`routing_band`, the two quantized prints, `derived_active_deployment_amount`,
`derived_senior_reserve_buffer`, `derived_senior_yield_bps`, `derived_junior_yield_bps`). After
consensus returns, the contract re-derives the whole allocation with integer arithmetic from the two
prints and reverts unless every field matches, so validators decide *what the market looks like*
and never get to invent a number that moves funds.

## Steward rules

| Rule | Where it lives |
|---|---|
| 1 pinned runner, classic SDK | line 1 of the contract, `from genlayer import *`, `@allow_storage @dataclass` |
| 2 no backdoors, no manual clock | no admin rebalance path, every window compared against `gl.message_raw["datetime"]`, no `advance_clock` |
| 3 funded custody, maximum liability | `vault_custody_balance`, `senior_tranche_principal`, `junior_tranche_principal`, `bond_custody`, `@gl.evm.contract_interface` account proof, `reserved_liability_wei` |
| 4, 9 consensus baselines and bands | `_render_text`, `_volatility_bps`, `_depth_tail`, `_derive_routing_fields`, `ROUTING_PRINCIPLE`, four discrete bands |
| 5 one invariant helper | `_compute_syndicate_epoch_state` is the only source for phases, timers, NAV and reservation |
| 6 sanitization, temporal precedence | `_clean_text`, `_clean_url`, `_scan_number`, `_phase` gates every transition |
| 8 non trapping payables | all four payable entry points credit `refundable_balances`, record `last_payable_rejection`, and pay out through `withdraw_refund` / `claim_refundable_balance` which restore the credit if the native send fails |
| 10 enforceable timing, zero winner refunds | `execute_consensus_rebalance` needs `subscription_close_epoch`, `settle_tranche_epoch` needs `rebalance_challenge_deadline_epoch`, `REFUNDABLE_ZERO_UTILIZATION` and `rebalance_timeout_epoch` feed `claim_epoch_principal_refund` |
| 11 four way identity | `scripts/verify_identity.py`, result in `evidence/studionet_deployment.json` |

## Live scenario, every transaction explorer checkable

30 transactions, all `FINALIZED` with leader execution `SUCCESS` and result `MAJORITY_AGREE`:

| Epoch | Route | Band | Volatility | Tail risk | Routed | Shield | Senior / junior yield | Outcome |
|---|---|---|---|---|---|---|---|---|
| 1 | 6 GEN senior, 3 GEN junior | `HIGH_CONVICTION_DEPLOYMENT` | 2000 bps | 1000 bps | 7.182 GEN | 1.7955 GEN | 500 / 2000 bps | settled, principal plus yield claimable |
| 2 | 4 GEN senior, 2 GEN junior, then challenged and re audited | `HIGH_CONVICTION_DEPLOYMENT` | 2000 bps | 1000 bps | 4.788 GEN | 1.197 GEN | 500 / 2000 bps | settled after a paid re audit |
| 3 | 2 GEN senior, 1 GEN junior, never audited | none | 0 | 0 | 0 | 0 | 0 | `PRINCIPAL_REFUND_CLAIMABLE`, both LPs recovered 100 percent of principal, the routing bond was forfeited into the yield pool |
| 4 | 3 GEN junior, 2 GEN senior | `DEFENSIVE_COLLATERAL_BUFFER` | 2000 bps | 6000 bps | 0.9975 GEN | 3.99 GEN | 1500 / 250 bps | settled |

Soft fail proof: a proposal with only a quarter of the routing bond finalized as `SUCCESS` without
opening an epoch, the 2.995 GEN stayed claimable by that address, and `withdraw_refund` then paid
it out in a separate finalized transaction (`0x408748612b0986a1a4...`). At the end of the run the
ledger custody and the chain balance of the vault both read 0.03 GEN, which is the residual
claimable balance, so the claim rail really moved native value out of custody.

Reproduce with:

```bash
.venv/bin/python scripts/deploy_studionet.py            # full scenario, resumable
.venv/bin/python scripts/deploy_studionet.py --status   # what has been recorded
```

## Repository map

```
contracts/prophet_syndicate.py       the intelligent contract (36,560 bytes)
tests/test_prophet_syndicate_direct.py  72 direct mode tests
tests/conftest.py                    fixtures, feed mocks and the fixed epoch clock
scripts/deploy_studionet.py          studionet deployment and live scenario with evidence
scripts/verify_identity.py           four way sha256 identity check
scripts/render_syndicate_emblem.py   the 512x512 emblem, drawn from the tranche waterfall
scripts/produce_syndicate_overview_video.py  52 second subtitled desk video with an ambient bed
scripts/publish_github.py            repository creation, main and gh-pages push
frontend/                            the quant tranche desk (Vite, React, TypeScript, Tailwind)
evidence/                            machine readable on chain proof (checkpoint is git ignored)
docs/                                emblem, demo video, evidence and review notes
```

## Running it

```bash
python3 -m venv .venv
.venv/bin/pip install genlayer-py genlayer-test genvm-linter python-dotenv web3 requests pillow numpy
.venv/bin/genvm-lint check contracts/prophet_syndicate.py
.venv/bin/pytest tests -q
cp .env.example .env          # GENLAYER_PRIVATE_KEY and GITHUB_TOKEN
```

Frontend:

```bash
cd frontend
npm install
npm run dev                            # http://127.0.0.1:5183/prophet-syndicate/
npm run build
```

The desk loads in four or fewer chain reads: `get_custody_accounting_summary`,
`get_tranche_position`, `eth_getBalance` for the vault and, for LPs with a key, one estimate per
action. Burner desks for three independent LPs are generated in page storage, and MetaMask or any
injected wallet can sign the same calls.

## What is on chain, what is not

* The contract owns custody, the routing decision, the temporal gates and every payout.
* The frontend owns presentation, the local integer preview of the band model and the wallet.
* Feed providers own the raw numbers. Validators re-fetch both documents themselves, and the
  quantized grid plus the deterministic re-derivation is what keeps a drifting feed from moving
  funds. If a feed is unreachable the consensus call reverts, the epoch simply is not audited, and
  after `rebalance_timeout_epoch` LPs recover their full principal.
* `evidence/_checkpoint.json` is local run state and is git ignored on purpose.

## Known limits, stated plainly

* Tranche yield is funded only by entry fees and audit bonds, so the on chain prints show the
  senior floor target and the unfunded part of it (`unfunded_floor_wei`) rather than promising a
  rate the vault cannot pay.
* Epochs are sequential. One routing window at a time keeps capital attribution exact, at the cost
  of throughput.
* The `eth_getBalance` answer for externally owned accounts on studionet lagged during the run, so
  the evidence claims the vault account balance proof and the finalized payout transactions, not a
  per wallet delta.
* Studionet finality for a consensus call took 40 to 60 seconds per transaction in this run.
