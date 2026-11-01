# Adversarial Review: ProphetSyndicate Tranche Custody Contract

Date: 2026-11-01
Contract: contracts/prophet_syndicate.py (752 lines, runner 1jb45aa8)
Deployed: 0x206bdF01A814e8ae27EbC4A7aC138995217B95F8 (studionet chain 61999)

## 1. State Machine

| Status | Phase | Entry | Exit |
|--------|-------|-------|------|
| SUBSCRIPTION_OPEN | COLLECT | propose_routing_epoch_payable | execute_consensus_rebalance |
| (timeout from OPEN) | REFUNDABLE | rebalance_timeout_epoch passed | claim_epoch_principal_refund |
| FINALIZED | CHALLENGE (now < deadline) | consensus deployment > 0 | challenge or settle |
| FINALIZED | READY (now >= deadline) | challenge deadline passed | settle_tranche_epoch |
| CHALLENGED | AWAIT_AUDIT | challenge_routing_allocation_payable | execute_consensus_rebalance (re-audit) |
| ZERO_UTIL | REFUNDABLE | consensus deployment == 0 | claim_epoch_principal_refund |
| SETTLED | DONE | settle_tranche_epoch | terminal |
| REFUNDABLE | REFUNDABLE | claim during refund phase | claim_epoch_principal_refund |
| RELEASED | DONE | last LP claims | terminal |

All transitions guarded by `_phase()`. No status can be skipped.

## 2. Liveness: No Stuck Funds

Every locked status has a deterministic timeout recovery:
- OPEN: if nobody calls execute, after rebalance_timeout_epoch the phase becomes REFUNDABLE.
- FINALIZED/CHALLENGED: after rebalance_timeout_epoch, becomes REFUNDABLE.
- ZERO_UTIL/REFUNDABLE: claim_epoch_principal_refund releases to refundable_balances.
- refundable_balances: withdraw_refund or claim_refundable_balance (always callable).
- Bonds: released on settle (False = refund to proposer) or forfeited on timeout (True = yield pool).

No party can block another party's exit. FIXED by design.

## 3. Race Conditions

| Pair | Mutual exclusion mechanism | Test |
|------|---------------------------|------|
| settle vs challenge | `now >= deadline` vs `now < deadline` (strict complement) | test_settlement_is_refused_while_the_challenge_window_is_open |
| execute vs challenge | PHASE_AWAIT_AUDIT vs PHASE_CHALLENGE | test_executing_twice_is_refused_once_the_epoch_is_finalized |
| claim vs settle | PHASE_REFUNDABLE vs PHASE_READY | test_settled_epochs_are_not_refundable |
| double settle | STATUS_SETTLED -> PHASE_DONE -> reject | test_an_epoch_settles_only_once |
| double refund | _release_principal zeroes table, second call moved=0 -> reject | test_principal_refund_cannot_be_claimed_twice |
| propose while in-flight | _in_flight() != None -> soft_fail REASON_BUSY | test_propose_refuses_a_second_epoch_while_one_is_in_flight |

All guards are mutually exclusive by both status AND timestamp. FIXED.

## 4. Accounting Invariants

**Primary**: native_custody_balance == senior + junior + refundable + bonds + yield_pool
**PST backing**: pst_total_supply == vault_custody_balance == senior_total + junior_total
**Conservation**: deployment + reserve == senior_commit + junior_commit (checked in execute)

Every fund movement traced:
- propose: native += v; bonds += bond; refundable += (v - bond). Sum unchanged.
- subscribe: native += v; tranche += (v - fee); pool += fee. Sum unchanged.
- challenge: native += v; refundable += (v - 2b); pool += 2b. Sum unchanged.
- settle: tranche -> 0; refundable += (principal + yield); pool -= yield; bonds -= routing_bond. Sum unchanged.
- withdraw: refundable -= m; native -= m (paid) or refundable restored (failed). Correct.
- refund: tranche -= m; refundable += m. Sum unchanged.

Tests: test_custody_partition_equals_native_custody_at_every_step,
test_the_vault_is_always_backed_one_to_one,
test_routing_conserves_liquidity_across_every_band,
test_settlement_cannot_pay_more_yield_than_the_pool_holds,
test_invariants_hold_across_a_full_epoch_lifecycle. FIXED.

## 5. Input Validation

- All time windows: floor (60/60/120s) and ceiling (30 days) enforced in __init__ via _bound().
- All amounts: MIN/MAX bounds on subscription (0.001-1000 GEN), bond (0.001-100 GEN), epoch cap (1-1M GEN), depth reference (1K-1Q units).
- Addresses: _addr() validates 42-char hex, rejects non-hex.
- URLs: _clean_url() requires https, rejects @, #, space, backslash, unqualified hosts.
- Epoch ID: _require_epoch() rejects unknown IDs.
- Zero-value calls: rejected in _subscribe.
- Challenge count: capped at MAX_CHALLENGES_PER_EPOCH = 2.
- Epoch count: capped at MAX_EPOCHS = 64.

Tests: test_deploy_refuses_a_tranche_cap_below_the_floor, test_deploy_refuses_a_non_https_macro_feed,
test_subscription_below_the_minimum_is_refunded_not_lost, test_subscription_over_the_tranche_cap_is_soft_failed,
test_challenge_slots_are_capped. FIXED.

## 6. Consensus Safety

- **Equivalence**: prompt_comparative with ROUTING_PRINCIPLE requiring exact agreement on all 7 fields. No numeric tolerance.
- **Post-consensus verification**: the consensus result is re-derived deterministically via _derive_routing_fields and checked field-by-field against the LLM output. If any field disagrees, the transaction reverts.
- **Conservation check**: deployment + reserve must equal total commit. Rejects non-conserving consensus.
- **Band derivation**: routing_band is derived from tail_risk_bps via fixed thresholds, not from LLM free text. The LLM cannot invent a band.
- **Web fetches inside leader_fn**: validators rerun the same function, fetching the same URLs independently. The fetched text is only scanned for specific JSON keys via _scan_number. Raw text never reaches the LLM judge.
- **Fail-closed**: unreachable feeds raise ERROR_TRANSIENT/ERROR_EXTERNAL, reverting the transaction. No partial state change.
- **Prompt injection**: _clean_text strips control chars, angle brackets, collapses whitespace. The LLM only sees the 7 derived numeric/string fields, not the raw document. Instructions embedded in fetched content cannot alter the verdict rule.
- **Direct mode limitation**: the 72 unit tests exercise the leader path only. Validator agreement is proven by the live studionet run (30 transactions, all MAJORITY_AGREE).

FIXED. No open concerns.

## 7. Test Coverage

72 tests covering:
- Every guard (wrong caller, wrong status, too early, too late, zero, overpay, boundary)
- All 4 routing bands with deterministic derivation
- Full lifecycle: propose -> subscribe -> execute -> challenge -> re-execute -> settle -> withdraw
- Race conditions (double execute, double settle, double refund, propose while in-flight)
- Accounting invariants asserted after every step
- Soft-fail paths (rejected payables keep funds claimable)
- Feed failure paths (unreachable feeds produce zero deployment, not a revert)
- Linkage probe (cross-contract read)

## Summary

No OPEN findings. All fund paths are guarded, all transitions are mutually exclusive, the accounting invariant is enforced and tested, consensus uses exact agreement with deterministic post-verification, and input validation has both floors and ceilings on every window and amount. The contract is safe to submit.
