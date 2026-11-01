import { useState } from "react";
import { BANDS, GEN } from "../config";
import type { Band } from "../config";
import { deriveRouting, formatGen, snapGrid, wei } from "../lib/model";
import type { EpochState, Summary } from "../types";

interface Props {
  summary: Summary | null;
  intakeEpoch: EpochState | null;
}

const GRID = Array.from({ length: 41 }, (_, index) => index * 250);

function GridSelect({ value, onChange, label }: { value: number; onChange: (next: number) => void; label: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="field mt-1" value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {GRID.map((step) => (
          <option key={step} value={step}>
            {step} bps
          </option>
        ))}
      </select>
    </label>
  );
}

export function StressModeler({ summary, intakeEpoch }: Props) {
  const last = summary?.epochs?.[summary.epochs.length - 1] ?? null;
  const [volatility, setVolatility] = useState(Number(snapGrid(wei(last?.quantized_volatility_baseline_bps || "1750")) ?? 1750n));
  const [tail, setTail] = useState(Number(snapGrid(wei(last?.quantized_tail_risk_bps || "2500")) ?? 2500n));
  const [seniorGen, setSeniorGen] = useState(6);
  const [juniorGen, setJuniorGen] = useState(3);

  const senior = BigInt(Math.max(0, seniorGen)) * GEN;
  const junior = BigInt(Math.max(0, juniorGen)) * GEN;
  const preview = deriveRouting(volatility, tail, senior, junior);

  return (
    <section className="pane">
      <div className="pane-head">
        <div>
          <div className="pane-title">macro volatility and tranche waterfall stress modeler</div>
          <div className="mono text-[11px] text-mute">
            integer preview of _derive_routing_fields / settlement authority stays on chain
          </div>
        </div>
        <span className="tag">{intakeEpoch ? `intake epoch ${intakeEpoch.epoch_id}` : "no open intake window"}</span>
      </div>
      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-3">
          <GridSelect label="quantized volatility baseline" value={volatility} onChange={setVolatility} />
          <GridSelect label="quantized tail risk correlation" value={tail} onChange={setTail} />
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">senior GEN</span>
              <input
                className="field mt-1"
                type="number"
                min={0}
                step={1}
                value={seniorGen}
                onChange={(event) => setSeniorGen(Math.max(0, Number(event.target.value)))}
              />
            </label>
            <label className="block">
              <span className="label">junior GEN</span>
              <input
                className="field mt-1"
                type="number"
                min={0}
                step={1}
                value={juniorGen}
                onChange={(event) => setJuniorGen(Math.max(0, Number(event.target.value)))}
              />
            </label>
          </div>
          <div className="rounded border border-ridge bg-obsidian p-3">
            <div className="label">live validator prints</div>
            <div className="mono mt-1 text-[12px] text-white">
              {last
                ? `epoch ${last.epoch_id} / vol ${last.quantized_volatility_baseline_bps} bps / tail ${last.quantized_tail_risk_bps} bps`
                : "awaiting the first consensus routing"}
            </div>
            <div className="mono mt-1 text-[11px] text-mute">
              {last ? `band ${last.routing_band || "unset"} / routed ${formatGen(last.derived_active_deployment_amount)} GEN` : "no epoch yet"}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {BANDS.map((band: Band) => {
            const model = deriveRouting(volatility, tail, senior, junior);
            const active = model.band === band;
            const share = { HIGH_CONVICTION_DEPLOYMENT: 8000, BALANCED_HEDGE_ALLOCATION: 5000, DEFENSIVE_COLLATERAL_BUFFER: 2000, CORRELATION_FREEZE_WITHDRAWAL: 0 }[band];
            const routed = ((senior + junior) * BigInt(share)) / 10000n;
            return (
              <div
                key={band}
                className={`rounded border p-3 transition ${active ? "border-rebalance/60 bg-rebalance/[0.06]" : "border-ridge bg-obsidian"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="mono text-[12px] tracking-[0.08em] text-white">{band.replace(/_/g, " ")}</div>
                  <span className={`tag ${active ? "text-rebalance border-rebalance/50" : ""}`}>
                    {active ? "modelled band" : `${share / 100}% routed`}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  <div>
                    <div className="label">routed</div>
                    <div className="mono text-[13px] text-junior">{formatGen(routed)}</div>
                  </div>
                  <div>
                    <div className="label">shield</div>
                    <div className="mono text-[13px] text-senior">{formatGen(senior + junior - routed)}</div>
                  </div>
                  <div>
                    <div className="label">floor</div>
                    <div className="mono text-[13px] text-white">
                      {formatGen(derivedFloor(band, senior))}
                    </div>
                  </div>
                  <div>
                    <div className="label">alpha</div>
                    <div className="mono text-[13px] text-rebalance">
                      {band === preview.band ? `${formatGen(preview.deployment)} GEN` : "subordinate"}
                    </div>
                  </div>
                </div>
                <div className="bar mt-2 flex overflow-hidden rounded-sm">
                  <div className="h-full bg-junior" style={{ width: `${(share / 100).toString()}%` }} />
                  <div className="h-full bg-senior/40" style={{ width: `${(100 - share / 100).toString()}%` }} />
                </div>
              </div>
            );
          })}
          <div className="mono text-[11px] text-mute">
            preview yields {preview.seniorYieldBps.toString()} bps senior / {preview.juniorYieldBps.toString()} bps junior; the
            vault only ever pays yield out of entry fees and audit bonds, so the pool caps what the model can actually settle.
          </div>
        </div>
      </div>
    </section>
  );
}

function derivedFloor(band: Band, senior: bigint): bigint {
  const floorBps = { HIGH_CONVICTION_DEPLOYMENT: 250, BALANCED_HEDGE_ALLOCATION: 500, DEFENSIVE_COLLATERAL_BUFFER: 1000, CORRELATION_FREEZE_WITHDRAWAL: 0 }[band];
  return (senior * BigInt(floorBps)) / 10000n;
}
