#!/usr/bin/env python3
"""Four way sha256 identity for the deployed intelligent contract.

Compares the LF normalised local file, the git blob at HEAD, the GitHub raw file
and the source the chain node serves for the deployed address. Writes the result
into evidence/studionet_deployment.json so the claim is machine checkable.

    .venv/bin/python scripts/verify_identity.py
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = ROOT / "contracts" / "prophet_syndicate.py"
RELATIVE = "contracts/prophet_syndicate.py"
EVIDENCE = ROOT / "evidence" / "studionet_deployment.json"
RAW_URL = "https://raw.githubusercontent.com/hoveiser/prophet-syndicate/main/%s" % RELATIVE
RPC_URL = "https://studio.genlayer.com/api"


def normalize(data: bytes) -> bytes:
    return data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def on_chain_source(address: str) -> bytes:
    from web3 import Web3

    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    raw = w3.provider.make_request("gen_getContractCode", [address])
    value = (raw or {}).get("result")
    if isinstance(value, bytes):
        return normalize(value)
    text = str(value or "").strip()
    if text.startswith("0x"):
        try:
            return normalize(bytes.fromhex(text[2:]))
        except ValueError:
            pass
    try:
        candidate = base64.b64decode(text, validate=True)
    except Exception:
        candidate = b""
    return normalize(candidate if candidate.startswith(b"# {") else text.encode("utf-8"))


def main() -> int:
    load_dotenv(ROOT / ".env")
    if not EVIDENCE.exists():
        print("run scripts/deploy_studionet.py first, the evidence file is missing")
        return 2
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    address = evidence.get("contract_address")
    local = CONTRACT.read_bytes()
    local_sha = sha(normalize(local))

    git_sha = None
    try:
        blob = subprocess.run(["git", "-C", str(ROOT), "cat-file", "blob", "HEAD:%s" % RELATIVE],
                              capture_output=True, check=True).stdout
        git_sha = sha(normalize(blob))
    except Exception as exc:  # noqa: BLE001
        print("git blob unavailable:", str(exc)[:120])

    raw_sha = None
    try:
        response = requests.get(RAW_URL, timeout=40)
        if response.status_code == 200:
            raw_sha = sha(normalize(response.content))
        else:
            print("github raw returned HTTP %d, has main been pushed?" % response.status_code)
    except Exception as exc:  # noqa: BLE001
        print("github raw unavailable:", str(exc)[:120])

    chain_sha = None
    chain_bytes = None
    try:
        source = on_chain_source(address)
        chain_bytes = len(source)
        chain_sha = sha(source)
    except Exception as exc:  # noqa: BLE001
        print("on chain code unavailable:", str(exc)[:120])

    identity = {
        "local_lf_sha256": local_sha,
        "local_lf_bytes": len(normalize(local)),
        "git_blob_sha256": git_sha,
        "github_raw_sha256": raw_sha,
        "onchain_sha256": chain_sha,
        "onchain_bytes": chain_bytes,
        "match_local_git": local_sha == git_sha,
        "match_local_raw": local_sha == raw_sha,
        "match_local_onchain": local_sha == chain_sha,
        "match_all_four": local_sha == git_sha == raw_sha == chain_sha,
        "raw_url": RAW_URL,
        "explorer": "https://genlayer-explorer.vercel.app/contracts/%s" % address,
    }
    evidence["sha256_identity"] = identity
    EVIDENCE.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(identity, indent=2))
    if not identity["match_all_four"]:
        print("NOT identical across all four sources yet")
        return 1
    print("four way identity confirmed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
