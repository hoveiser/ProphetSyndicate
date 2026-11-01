import { GEN, NETWORK_LABEL } from "../config";
import type { DeskHandle } from "../lib/chain";
import { formatGen, shortAddress } from "../lib/model";

interface Props {
  desk: DeskHandle | null;
  slot: number;
  burnerLabel: string;
  deskBalance: bigint | null;
  onBurner: (index: number) => void;
  onInjected: () => void;
  onDetach: () => void;
}

const SLOTS = ["ALPHA", "BRAVO", "CHARLIE"];

export function WalletBar({ desk, slot, burnerLabel, deskBalance, onBurner, onInjected, onDetach }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded border border-ridge bg-panel p-1">
        {SLOTS.map((label, index) => (
          <button
            key={label}
            onClick={() => onBurner(index)}
            className={`rounded px-3 py-[6px] text-[10px] uppercase tracking-[0.2em] transition ${
              desk?.kind === "burner" && slot === index
                ? "bg-senior/20 text-senior"
                : "text-mute hover:text-senior"
            }`}
          >
            desk {label}
          </button>
        ))}
      </div>
      <button className="action-junior" onClick={onInjected}>
        connect wallet
      </button>
      {desk ? (
        <div className="flex items-center gap-3 rounded border border-ridge bg-panel px-3 py-2">
          <div>
            <div className="label">{desk.kind === "burner" ? "burner lp" : "injected lp"}</div>
            <div className="mono text-[12px] text-white">{shortAddress(desk.address)}</div>
          </div>
          <div>
            <div className="label">{NETWORK_LABEL} balance</div>
            <div className="mono text-[12px] text-senior">
              {deskBalance === null ? "n/a" : formatGen(deskBalance)} GEN
            </div>
          </div>
          <button className="action-ghost" onClick={onDetach}>
            detach
          </button>
        </div>
      ) : (
        <span className="tag">read only desk, {shortAddress(burnerLabel)} armed</span>
      )}
      <span className="tag">{(GEN / GEN).toString()} GEN = 1 unit of custody</span>
    </div>
  );
}
