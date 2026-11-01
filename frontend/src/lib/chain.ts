import { createAccount, createClient, chains, generatePrivateKey } from "genlayer-js";
import { CONTRACT_ADDRESS, RPC_URL } from "../config";

const { studionet } = chains;

export type TerminalClient = ReturnType<typeof createClient>;

export interface DeskHandle {
  client: TerminalClient;
  address: string;
  writable: boolean;
  kind: "burner" | "injected";
}

const SECRET_KEY = "prophetsyndicate.desk.secret";

export function burnerKey(slot: number): `0x${string}` {
  const storageKey = `${SECRET_KEY}.${slot}`;
  const existing = window.localStorage.getItem(storageKey);
  if (existing && existing.startsWith("0x") && existing.length === 66) {
    return existing as `0x${string}`;
  }
  const fresh = generatePrivateKey();
  window.localStorage.setItem(storageKey, fresh);
  return fresh;
}

export function deskFromKey(key: `0x${string}`): DeskHandle {
  const account = createAccount(key);
  return { client: createClient({ chain: studionet, account }), address: account.address, writable: true, kind: "burner" };
}

export function readOnlyDesk(address?: string): DeskHandle {
  const client = createClient({ chain: studionet });
  return { client, address: address ?? CONTRACT_ADDRESS, writable: false, kind: "burner" };
}

export async function connectInjected(): Promise<DeskHandle> {
  const provider = window.ethereum;
  if (!provider) throw new Error("No injected wallet in this browser");
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.length) throw new Error("The wallet returned no account");
  return {
    client: createClient({ chain: studionet, account: accounts[0] as `0x${string}` }),
    address: accounts[0],
    writable: true,
    kind: "injected",
  };
}

export async function readJson<T>(client: TerminalClient, functionName: string, args: unknown[] = []): Promise<T> {
  const raw = await client.readContract({ address: CONTRACT_ADDRESS, functionName, args: args as never[] });
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }
  return raw as unknown as T;
}

export async function readScalar(client: TerminalClient, functionName: string, args: unknown[] = []): Promise<bigint> {
  const raw = await client.readContract({ address: CONTRACT_ADDRESS, functionName, args: args as never[] });
  return typeof raw === "bigint" ? raw : BigInt(String(raw));
}

export interface TxOutcome {
  hash: string;
  execution: string | null;
  status: string | null;
}

export class TxRejected extends Error {
  readonly hash: string;
  readonly execution: string;

  constructor(hash: string, execution: string) {
    super(`on chain execution reported ${execution}`);
    this.name = "TxRejected";
    this.hash = hash;
    this.execution = execution;
  }
}

type HashArg = Parameters<TerminalClient["waitForTransactionReceipt"]>[0]["hash"];

export async function send(
  client: TerminalClient,
  functionName: string,
  args: unknown[] = [],
  valueWei: bigint = 0n,
): Promise<TxOutcome> {
  const hash = (await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args: args as never[],
    value: valueWei,
  })) as unknown as HashArg;
  const receipt = (await client.waitForTransactionReceipt({ hash, interval: 3000, retries: 160 })) as unknown as Record<
    string,
    unknown
  >;
  const execution =
    (receipt?.txExecutionResultName as string | undefined) ?? (receipt?.tx_execution_result_name as string | undefined) ?? null;
  const status = (receipt?.statusName as string | undefined) ?? (receipt?.status_name as string | undefined) ?? null;
  if (execution && execution.includes("ERROR")) {
    throw new TxRejected(String(hash), execution);
  }
  return { hash: String(hash), execution, status };
}

/** Custody proof straight from the chain node, independent of the contract ledger. */
export async function nativeBalanceOfVault(): Promise<bigint | null> {
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [CONTRACT_ADDRESS, "latest"] }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { result?: string };
    return payload.result ? BigInt(payload.result) : null;
  } catch {
    return null;
  }
}

export function describeFailure(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const classified = text.match(/\[(EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\][^"'\n]*/);
  if (classified) return classified[0];
  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
}
