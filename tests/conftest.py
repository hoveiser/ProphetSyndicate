"""Shared fixtures and mock helpers for ProphetSyndicate direct mode tests."""

import json
import sys

import pytest

CONTRACT = "contracts/prophet_syndicate.py"

# 1 GEN is 10 ** 18 wei. Subscriptions below MIN_SUBSCRIBE_WEI are rejected.
GEN = 10 ** 18

# ProphetGrid books are denominated in collateral units, not wei. A reference book
# deeper than the live book pushes the tail risk print up, a thinner one pushes it down.
DEEP = 10 ** 6
SHALLOW = 10 ** 9

MACRO_JSON = json.dumps({"chart": {"result": [{"meta": {"symbol": "^VIX", "regularMarketPrice": 18.53}}]}})

# Two ProphetGrid markets with 1.6M of open interest and a 3:1 YES to NO skew.
DEPTH_JSON = json.dumps(
    {
        "markets": [
            {"total_pot": 1000000, "yes_pool": 750000, "no_pool": 250000},
            {"total_pot": 600000, "yes_pool": 450000, "no_pool": 150000},
        ],
        "platform_stats": {"total_volume": 2800000},
    }
)


def deploy(direct_deploy):
    """Deploy with windows short enough for a real test run and caps in GEN."""
    return direct_deploy(
        CONTRACT,
        "",  # linked ProphetGrid address falls back to the accepted studionet deployment
        "",  # macro feed url falls back to the pinned default
        "",  # market depth feed url falls back to the pinned default
        40 * GEN,  # per tranche epoch cap
        10 ** 16,  # routing bond, 0.01 GEN
        600,  # subscription window seconds
        900,  # challenge window seconds
        1800,  # audit timeout seconds
    )


def at(direct_vm, timestamp: str) -> None:
    """Point gl.message_raw['datetime'] at a fixed instant for window tests."""
    gl = sys.modules.get("genlayer.gl")
    assert gl is not None, "the contract module must be imported before setting time"
    gl.message_raw["datetime"] = timestamp


def mock_feeds(direct_vm, macro=MACRO_JSON, depth=DEPTH_JSON) -> None:
    direct_vm.mock_web(r"query1\.finance\.yahoo\.com", {"status": 200, "body": macro})
    direct_vm.mock_web(r"raw\.githubusercontent\.com.*prophet-grid.*", {"status": 200, "body": depth})


def payload(value) -> dict:
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    if isinstance(value, str):
        return json.loads(value)
    return value


@pytest.fixture
def syndicate(direct_deploy):
    return deploy(direct_deploy)


@pytest.fixture
def clock():
    """A fixed epoch clock. Windows are always measured against these instants."""
    return {
        "open": "2026-11-01T12:00:00Z",
        "closed": "2026-11-01T12:10:01Z",
        "audited": "2026-11-01T12:11:00Z",
        "challenge_open": "2026-11-01T12:20:00Z",
        "settle": "2026-11-01T12:30:01Z",
        "timed_out": "2026-11-01T12:50:01Z",
    }


def state_for(contract, epoch_id) -> dict:
    """Read one epoch back through the summary view, the desk's single source."""
    rows = payload(contract.get_custody_accounting_summary())["epochs"]
    for row in rows:
        if row["epoch_id"] == str(int(epoch_id)):
            return row
    raise AssertionError("epoch %s is missing from the summary" % epoch_id)


def last_state(contract) -> dict:
    return payload(contract.get_custody_accounting_summary())["epochs"][-1]


def split_receipt(value) -> list:
    """Write methods answer with a short colon separated receipt."""
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    return str(value).split(":")
