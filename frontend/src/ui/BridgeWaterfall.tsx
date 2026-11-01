import { EXPLORER_URL, LINKED_PROPHET_GRID_ADDRESS, LINKED_PROPHET_GRID_URL } from "../config";
import { bps, formatGen, percentOf, shortAddress, wei } from "../lib/model";
import type { Position, Summary } from "../types";

type Act = (label: string, functionName: string, args?: unknown[], valueWei?: bigint) => Promise<void>;

interface Props {
  summary: Summary | null;
  position: Position | null;
  chainVaultWei: bigint | null;
  busy: string;
  onAct: Act;
}

export function BridgeWaterfall({ summary, position, chainVaultWei, busy, onAct }: Props) {
  const partition = summary?.partition ?? {};
  const senior = wei(partition.senior_principal_wei);
  const junior = wei(partition.junior_principal_wei);
  const claimable = wei(partition.claimable_wei);
  const bonds = wei(partition.locked_bond_wei);
  const pool = wei(partition.yield_pool_wei);
  const custody = senior + junior;
  const ledgerCustody = wei(summary?.native_custody_balance);
  const floor = wei(summary?.unfunded_floor_wei);
  const reserved = wei(summary?.reserved_liability_wei);
  const checks = summary?.checks ?? {};
  const claimableForMe = wei(position?.claimable_wei);
  const rejection = position?.last_rejection ?? "";
  const probeDetail = summary?.linked_probe_status ?? "NOT_PROBED";
  const linkedMarkets = probeDetail.startsWith("VERIFIED_") ? (probeDetail.match(/VERIFIED_(\d+)/)?.[1] ?? "0") : "0";
  const probeStatus = summary?.linked_probe_status ?? "NOT_PROBED";

  return (
    <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="pane">
        <div className="pane-head">
          <div>
            <div className="pane-title">ProphetGrid ecosystem bridge</div>
            <div className="mono text-[11px] text-mute">on chain linkage / live feed pair</div>
          </div>
          <span className={`tag ${probeStatus.startsWith("VERIFIED") ? "text-senior border-senior/40" : ""}`}>{probeStatus.replace("_", " ")}</span>
        </div>
        <div className="space-y-3 px-4 py-3">
          <div className="rounded border border-ridge bg-obsidian p-3">
            <div className="label">linked ProphetGrid core contract</div>
            <div className="mono text-[12px] text-senior">{LINKED_PROPHET_GRID_ADDRESS}</div>
            <div className="mono mt-1 text-[11px] text-mute">
              {Number(linkedMarkets)} ProphetGrid markets read on chain /{" "}
              <a className="text-junior" href={LINKED_PROPHET_GRID_URL} target="_blank" rel="noreferrer">
                ecosystem module
              </a>
            </div>
          </div>
          <div className="row">
            <span className="label">macro volatility feed</span>
            <span className="mono text-[11px] text-white">{(summary?.macro_feed_url ?? "").replace("https://", "")}</span>
          </div>
          <div className="row">
            <span className="label">ProphetGrid depth feed</span>
            <span className="mono text-[11px] text-white truncate max-w-[15rem]">
              {(summary?.market_depth_url ?? "").replace("https://", "")}
            </span>
          </div>
          <div className="row">
            <span className="label">runner pin</span>
            <span className="mono text-[11px] text-white">py-genlayer 1jb45aa8 ... 09h6</span>
          </div>
          <div className="row">
            <span className="label">vault explorer</span>
            <a className="mono text-[11px] text-junior" href={EXPLORER_URL} target="_blank" rel="noreferrer">
              genlayer-explorer / contracts
            </a>
          </div>
        </div>
      </div>

      <div className="pane">
        <div className="pane-head">
          <div>
            <div className="pane-title">tranche waterfall and custody partition</div>
            <div className="mono text-[11px] text-mute">PST receipts are minted 1:1 against locked principal</div>
          </div>
          <span className={`tag ${summary?.ok ? "text-senior border-senior/40" : "text-rose border-rose/40"}`}>
            {summary ? (summary.ok ? "partition exact" : "partition broken") : "loading"}
          </span>
        </div>
        <div className="space-y-4 px-4 py-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="label">senior tvl</div>
              <div className="metric text-senior">{formatGen(senior)}</div>
              <div className="mono text-[11px] text-mute">GEN principal protected</div>
            </div>
            <div>
              <div className="label">junior tvl</div>
              <div className="metric text-junior">{formatGen(junior)}</div>
              <div className="mono text-[11px] text-mute">GEN first loss alpha</div>
            </div>
            <div>
              <div className="label">yield pool</div>
              <div className="metric text-rebalance">{formatGen(pool)}</div>
              <div className="mono text-[11px] text-mute">fees plus audit bonds</div>
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[0.18em] text-mute">
              <span>senior shield</span>
              <span>junior sleeve</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-sm bg-obsidian">
              <div className="h-full bg-senior" style={{ width: `${percentOf(senior, custody || 1n)}%` }} />
              <div className="h-full bg-junior" style={{ width: `${percentOf(junior, custody || 1n)}%` }} />
            </div>
            <div className="mono mt-1 text-[11px] text-mute">
              protection ratio {custody > 0n ? percentOf(junior + pool, senior || 1n) : "0.0"}% of senior principal covered
              by junior capital plus the fee pool
            </div>
          </div>

          <div>
            <div className="row">
              <span className="label">locked bonds</span>
              <span className="mono text-[12px] text-white">{formatGen(bonds)} GEN</span>
            </div>
            <div className="row">
              <span className="label">claimable credits</span>
              <span className="mono text-[12px] text-white">{formatGen(claimable)} GEN</span>
            </div>
            <div className="row">
              <span className="label">reserved principal liability</span>
              <span className="mono text-[12px] text-white">{formatGen(reserved)} GEN</span>
            </div>
            <div className="row">
              <span className="label">unfunded senior floor</span>
              <span className="mono text-[12px] text-rebalance">{formatGen(floor)} GEN</span>
            </div>
            <div className="row">
              <span className="label">ledger custody vs chain balance</span>
              <span className={`mono text-[12px] ${chainVaultWei === ledgerCustody ? "text-senior" : "text-rose"}`}>
                {formatGen(ledgerCustody)} / {chainVaultWei === null ? "n/a" : formatGen(chainVaultWei)} GEN
              </span>
            </div>
            <div className="row">
              <span className="label">consensus checks</span>
              <span className="mono text-[11px] text-mute">
                {Object.keys(checks).length ? Object.entries(checks).map(([name, value]) => `${name.split("_")[0]}:${value ? "ok" : "fail"}`).join(" / ") : "waiting"}
              </span>
            </div>
          </div>

          <div className="rounded border border-ridge bg-obsidian p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="label">soft fail refund drawer</div>
                <div className="mono text-[12px] text-white">
                  {position ? `${formatGen(claimableForMe)} GEN claimable by ${shortAddress(position.account)}` : "select a desk"}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="action"
                  disabled={claimableForMe <= 0n || Boolean(busy)}
                  onClick={() => void onAct("refund sweep", "claim_refundable_balance")}
                >
                  claim all
                </button>
                <button
                  className="action-ghost"
                  disabled={claimableForMe <= 0n || Boolean(busy)}
                  onClick={() => void onAct("partial refund", "withdraw_refund", [claimableForMe / 2n > 0n ? claimableForMe / 2n : claimableForMe])}
                >
                  withdraw half
                </button>
              </div>
            </div>
            <div className="mono mt-2 text-[11px] text-mute">
              {rejection ? `last vault rejection: ${rejection}` : "no rejection recorded for this address"}
            </div>
            <div className="mono mt-1 text-[11px] text-mute">
              every rejected payable keeps 100% of the sent wei as a claim; a failed native send restores the credit
            </div>
          </div>
          <div className="mono text-[11px] text-mute">
            senior yield cap {bps(wei(summary?.limits?.entry_fee_bps ?? "25") * 100n, 0)}% entry fee funds the pool;{" "}
            {(summary?.epoch_count ?? "0")} epochs tracked
          </div>
        </div>
      </div>
    </section>
  );
}
