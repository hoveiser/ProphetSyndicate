import { BAND_MODEL, FULL_SCALE_BPS, GRID_STEP_BPS, TAIL_CEILINGS } from "../config";
import type { Band } from "../config";

export const GEN_DECIMALS = 18;

export function wei(value: string | bigint | number | undefined): bigint {
  if (value === undefined || value === null || value === "") return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function formatGen(value: string | bigint, digits = 3): string {
  const raw = wei(value);
  const whole = raw / 10n ** 18n;
  const fraction = (raw % 10n ** 18n) / 10n ** BigInt(18 - Math.max(0, digits));
  if (digits <= 0) return `${whole.toString()}`;
  const pad = fraction.toString().padStart(digits, "0");
  return `${whole.toString()}.${pad}`;
}

export function bps(value: string | bigint, digits = 2): string {
  const raw = wei(value);
  const percent = raw / 100n;
  const rest = (raw % 100n) * 10n ** BigInt(digits) / 100n;
  return `${percent.toString()}.${rest.toString().padStart(digits, "0")}`;
}

/** The integer grid used inside the intelligent contract. */
export function snapGrid(valueBps: bigint): bigint {
  if (valueBps < 0n || valueBps > FULL_SCALE_BPS) return -1n;
  const stepped = ((valueBps + GRID_STEP_BPS / 2n) / GRID_STEP_BPS) * GRID_STEP_BPS;
  return stepped > FULL_SCALE_BPS ? FULL_SCALE_BPS : stepped;
}

export function bandForTail(tailBps: number): Band {
  if (tailBps <= TAIL_CEILINGS[0]) return "HIGH_CONVICTION_DEPLOYMENT";
  if (tailBps <= TAIL_CEILINGS[1]) return "BALANCED_HEDGE_ALLOCATION";
  if (tailBps <= TAIL_CEILINGS[2]) return "DEFENSIVE_COLLATERAL_BUFFER";
  return "CORRELATION_FREEZE_WITHDRAWAL";
}

export interface RoutingModel {
  band: Band;
  deployment: bigint;
  reserve: bigint;
  seniorYieldBps: bigint;
  juniorYieldBps: bigint;
  seniorFloor: bigint;
  shareBps: number;
}

/**
 * Replays _derive_routing_fields byte for byte in integer arithmetic. This is a
 * planning preview only: custody, routing and settlement all happen inside the
 * intelligent contract under validator consensus.
 */
export function deriveRouting(
  volatilityBps: number | bigint,
  tailRiskBps: number | bigint,
  seniorCommit: string | bigint,
  juniorCommit: string | bigint,
): RoutingModel {
  const vol = wei(volatilityBps);
  const tail = wei(tailRiskBps);
  const senior = wei(seniorCommit);
  const junior = wei(juniorCommit);
  const band = bandForTail(Number(tail));
  const model = BAND_MODEL[band];
  const liquidity = senior + junior;
  const deployment = (liquidity * BigInt(model.share)) / FULL_SCALE_BPS;
  const floor = (senior * BigInt(model.floor)) / FULL_SCALE_BPS;
  const bonus = vol / 4n > BigInt(model.bonusCap) ? BigInt(model.bonusCap) : vol / 4n;
  const spread = vol / 8n - tail / 4n;
  return {
    band,
    deployment,
    reserve: liquidity - deployment,
    seniorYieldBps: BigInt(model.floor) + bonus,
    juniorYieldBps: BigInt(model.juniorBase) + (spread > 0n ? spread : 0n),
    seniorFloor: floor,
    shareBps: model.share,
  };
}

export function countdown(targetEpoch: string, clockEpoch: string): string {
  const remaining = wei(targetEpoch) - wei(clockEpoch);
  if (remaining <= 0n) return "CLOSED";
  const seconds = Number(remaining);
  const minutes = Math.floor(seconds / 60);
  const secondsRest = seconds % 60;
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m ${String(secondsRest).padStart(2, "0")}s`;
}

export function shortAddress(address: string): string {
  if (!address || address.length < 14) return address || "0x0000";
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export function percentOf(part: bigint, total: bigint): string {
  if (total <= 0n) return "0.0";
  const scaled = (part * 1000n) / total;
  return `${(scaled / 10n).toString()}.${(scaled % 10n).toString()}`;
}
