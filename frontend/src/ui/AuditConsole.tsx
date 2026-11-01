import { useState } from "react";
import { BAND_SHORT, EXPLORER_URL, GEN, PHASE_LABEL } from "../config";
import type { DeskHandle } from "../lib/chain";
import { countdown, formatGen, shortAddress, wei } from "../lib/model";
import type { EpochState, Summary } from "../types";

type Act = (label: string, functionName: string, args?: unknown[], valueWei?: bigint) => Promise<void>;

interface Props {
  summary: Summary | null;
  desk: DeskHandle | null;
  busy: string;
  intakeEpoch: EpochState | null;
  onAct: Act;
  minSubscription: bigint;
  routingBond: bigint;
}

const BAND_TONE: Record<string, string> = {
  HIGH_CONVICTION_DEPLOYMENT: "text-junior border-junior/40",
  BALANCED_HEDGE_ALLOCATION: "text-senior border-senior/40",
  DEFENSIVE_COLLATERAL_BUFFER: "text-rebalance border-rebalance/40",
  CORRELATION_FREEZE_WITHDRAWAL: "text-rose border-rose/40",
};

export function AuditConsole({ summary, desk, busy, intakeEpoch, onAct, minSubscription, routingBond }: Props) {
  const [seniorStake, setSeniorStake] = useState(2);
  const [juniorStake, setJuniorStake] = useState(1);
  const [depthReference, setDepthReference] = useState("1000");
  const epochs = summary?.epochs ?? [];
  const writable = Boolean(desk?.writable);
  const locked = wei(summary?.partition.senior_principal_wei) + wei(summary?.partition.junior_principal_wei);
  const wallClock = Math.floor(Date.now() / 1000);

  return (
    <section className="pane">
      <div className="pane-head">
        <div>
          <div className="pane-title">validator routing audit and epoch redemption console</div>
          <div className="mono text-[11px] text-mute">
            comparative consensus proofs, window timers and one click LP settlement
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="tag">{epochs.length} epochs</span>
          <span className={`tag ${writable ? "text-senior border-senior/40" : ""}`}>
            {writable ? `signing ${shortAddress(desk?.address ?? "")}` : "read only"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-3">
          {epochs.length === 0 ? (
            <div className="mono text-[12px] text-mute">no routing epochs yet, propose the first intake window</div>
          ) : null}
          {epochs.map((row) => (
            <article key={row.epoch_id} className="rounded border border-ridge bg-obsidian p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="mono text-[12px] text-white">epoch {row.epoch_id}</span>
                  <span className={`tag ${BAND_TONE[row.routing_band] ?? ""}`}>
                    {BAND_SHORT[row.routing_band] ?? "awaiting consensus"}
                  </span>
                  <span className="tag">{PHASE_LABEL[row.phase] ?? row.phase}</span>
                </div>
                <div className="mono text-[11px] text-mute">
                  closes in {countdown(row.subscription_close_epoch, String(wallClock))} / challenge{" "}
                  {countdown(row.rebalance_challenge_deadline_epoch, String(wallClock))} / audit timeout{" "}
                  {countdown(row.rebalance_timeout_epoch, String(wallClock))}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-4">
                <Field label="volatility bps" value={row.quantized_volatility_baseline_bps} />
                <Field label="tail risk bps" value={row.quantized_tail_risk_bps} />
                <Field label="routed wei" value={formatGen(row.derived_active_deployment_amount, 4)} />
                <Field label="shield wei" value={formatGen(row.derived_senior_reserve_buffer, 4)} />
                <Field label="senior yield bps" value={row.derived_senior_yield_bps} />
                <Field label="junior yield bps" value={row.derived_junior_yield_bps} />
                <Field label="senior commit" value={`${formatGen(row.senior_commit_wei)} GEN`} />
                <Field label="junior commit" value={`${formatGen(row.junior_commit_wei)} GEN`} />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {row.phase === "AWAITING_CONSENSUS_AUDIT" ? (
                  <button
                    className="action-warn"
                    disabled={!writable || Boolean(busy)}
                    onClick={() => void onAct("consensus rebalance", "execute_consensus_rebalance", [Number(row.epoch_id)])}
                  >
                    run consensus routing
                  </button>
                ) : null}
                {row.phase === "CHALLENGE_WINDOW_OPEN" ? (
                  <button
                    className="action-warn"
                    disabled={!writable || Boolean(busy)}
                    onClick={() => void onAct("routing challenge", "challenge_routing_allocation_payable", [Number(row.epoch_id)], routingBond * 2n)}
                  >
                    buy a re-audit ({formatGen(routingBond * 2n)} GEN)
                  </button>
                ) : null}
                {row.phase === "READY_TO_SETTLE" ? (
                  <button
                    className="action"
                    disabled={!writable || Boolean(busy)}
                    onClick={() => void onAct("tranche settlement", "settle_tranche_epoch", [Number(row.epoch_id)])}
                  >
                    settle tranche epoch
                  </button>
                ) : null}
                {row.phase === "PRINCIPAL_REFUND_OPEN" ? (
                  <button
                    className="action"
                    disabled={!writable || Boolean(busy)}
                    onClick={() => void onAct("principal refund", "claim_epoch_principal_refund", [Number(row.epoch_id)])}
                  >
                    claim 100% principal refund
                  </button>
                ) : null}
                <a className="mono text-[11px] text-junior self-center" href={EXPLORER_URL} target="_blank" rel="noreferrer">
                  tx history
                </a>
              </div>
            </article>
          ))}
        </div>

        <div className="space-y-3">
          <div className="rounded border border-ridge bg-obsidian p-3">
            <div className="label">open intake window</div>
            <div className="mono mt-1 text-[12px] text-white">
              {intakeEpoch ? `epoch ${intakeEpoch.epoch_id} closes in ${countdown(intakeEpoch.subscription_close_epoch, String(wallClock))}` : "none"}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label">senior GEN</span>
                <input className="field mt-1" type="number" min={0} value={seniorStake} onChange={(event) => setSeniorStake(Math.max(0, Number(event.target.value)))} />
              </label>
              <label className="block">
                <span className="label">junior GEN</span>
                <input className="field mt-1" type="number" min={0} value={juniorStake} onChange={(event) => setJuniorStake(Math.max(0, Number(event.target.value)))} />
              </label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                className="action"
                disabled={!writable || !intakeEpoch || seniorStake * Number(GEN) < Number(minSubscription) || Boolean(busy)}
                onClick={() => void onAct("senior subscription", "subscribe_senior_tranche_payable", [], BigInt(seniorStake) * GEN)}
              >
                fund senior tranche
              </button>
              <button
                className="action-junior"
                disabled={!writable || !intakeEpoch || juniorStake * Number(GEN) < Number(minSubscription) || Boolean(busy)}
                onClick={() => void onAct("junior subscription", "subscribe_junior_tranche_payable", [], BigInt(juniorStake) * GEN)}
              >
                fund junior sleeve
              </button>
            </div>
            <div className="mono mt-2 text-[11px] text-mute">
              minimum {formatGen(minSubscription, 4)} GEN per call, 25 bps entry fee funds the senior floor pool
            </div>
          </div>

          <div className="rounded border border-ridge bg-obsidian p-3">
            <div className="label">propose the next routing epoch</div>
            <label className="block mt-2">
              <span className="label">linked depth reference units</span>
              <input className="field mt-1" value={depthReference} onChange={(event) => setDepthReference(event.target.value.replace(/[^0-9]/g, ""))} />
            </label>
            <button
              className="action mt-2 w-full"
              disabled={!writable || intakeEpoch !== null || Boolean(busy)}
              onClick={() => void onAct("propose epoch", "propose_routing_epoch_payable", [wei(depthReference || "1000")], routingBond)}
            >
              lock bond {formatGen(routingBond)} GEN and open intake
            </button>
            <div className="mono mt-2 text-[11px] text-mute">
              routing windows are sequential, one epoch in flight at a time
            </div>
          </div>

          <div className="rounded border border-ridge bg-obsidian p-3">
            <div className="label">vault invariants</div>
            {Object.entries(summary?.checks ?? {}).map(([name, value]) => (
              <div className="row" key={name}>
                <span className="mono text-[11px] text-mute">{name.replace(/_/g, " ")}</span>
                <span className={`mono text-[11px] ${value ? "text-senior" : "text-rose"}`}>{value ? "intact" : "broken"}</span>
              </div>
            ))}
            <div className="row">
              <span className="mono text-[11px] text-mute">locked principal</span>
              <span className="mono text-[11px] text-white">{formatGen(locked)} GEN</span>
            </div>
            <div className="row">
              <span className="mono text-[11px] text-mute">intake window clock</span>
              <span className="mono text-[11px] text-white">{new Date(clockWall()).toISOString().slice(11, 19)}Z</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function clockWall(): number {
  return Math.floor(Date.now() / 1000);
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mono text-[12px] text-white">{value || "0"}</div>
    </div>
  );
}
