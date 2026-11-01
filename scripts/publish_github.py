#!/usr/bin/env python3
"""Create the public repository and publish main plus the built gh-pages branch.

Uses GITHUB_TOKEN from this project's own .env. The token is never printed, and no
credential from any other directory is read.

    .venv/bin/python scripts/publish_github.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
OWNER = "hoveiser"
REPO = "prophet-syndicate"
API = "https://api.github.com"
SITE = ROOT / "frontend" / "dist"
DESCRIPTION = (
    "AI rebalanced prediction market liquidity syndicate and senior / junior tranche capital "
    "router for the ProphetGrid ecosystem, running on GenLayer studionet"
)
TOPICS = ["genlayer", "intelligent-contracts", "defi", "prediction-markets", "liquidity-routing", "treasury"]


def run(*args: str, cwd: Path | None = None) -> str:
    completed = subprocess.run(list(args), cwd=str(cwd or ROOT), capture_output=True, text=True)
    if completed.returncode != 0:
        raise SystemExit("command failed: %s\n%s" % (" ".join(args), completed.stderr[-800:]))
    return completed.stdout.strip()


def token() -> str:
    value = os.environ.get("GITHUB_TOKEN", "")
    if not value:
        raise SystemExit("GITHUB_TOKEN is missing from .env")
    return value


def ensure_repo(headers: dict) -> None:
    existing = requests.get("%s/repos/%s/%s" % (API, OWNER, REPO), headers=headers, timeout=40)
    if existing.status_code == 200:
        print("repository already exists")
        return
    created = requests.post(
        "%s/user/repos" % API,
        headers=headers,
        json={"name": REPO, "description": DESCRIPTION, "homepage": "https://%s.github.io/%s/" % (OWNER, REPO),
              "public": True, "has_issues": False, "has_wiki": False, "auto_init": False},
        timeout=60,
    )
    if created.status_code not in (201, 422):
        raise SystemExit("could not create the repository: %s %s" % (created.status_code, created.text[:400]))
    print("repository created")


def set_topics(headers: dict) -> None:
    response = requests.put(
        "%s/repos/%s/%s/topics" % (API, OWNER, REPO),
        headers={**headers, "Accept": "application/vnd.github.mercy-preview+json"},
        json={"names": TOPICS},
        timeout=40,
    )
    print("topics", response.status_code)


def set_description(headers: dict) -> None:
    response = requests.patch(
        "%s/repos/%s/%s" % (API, OWNER, REPO),
        headers=headers,
        json={"description": DESCRIPTION, "homepage": "https://%s.github.io/%s/" % (OWNER, REPO)},
        timeout=40,
    )
    print("description", response.status_code)


def main() -> int:
    load_dotenv(ROOT / ".env")
    secret = token()
    headers = {"Authorization": "Bearer %s" % secret, "X-Requested-With": "JSON",
               "Content-Type": "application/json", "Accept": "application/vnd.github+json"}
    if not (ROOT / ".git").exists():
        run("git", "init", "-b", "main")
    ensure_repo(headers)
    set_description(headers)
    set_topics(headers)

    remote = "https://x-access-token:%s@github.com/%s/%s.git" % (secret, OWNER, REPO)
    try:
        run("git", "remote", "add", "origin", remote)
    except SystemExit:
        run("git", "remote", "set-url", "origin", remote)

    run("git", "push", "-u", "origin", "main")
    print("pushed main")
    tag = run("git", "tag", "-l")
    if "studionet-v1" not in tag:
        raise SystemExit("tag studionet-v1 is missing, deploy and verify first")
    run("git", "push", "origin", "studionet-v1")
    print("pushed the studionet-v1 tag")

    if not SITE.exists():
        raise SystemExit("frontend/dist is missing, run npm run build first")
    staging = Path(os.environ.get("TMPDIR", "/tmp")) / "prophet-syndicate-gh-pages"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    shutil.copytree(SITE, staging, dirs_exist_ok=True)
    (staging / ".nojekyll").write_text("", encoding="utf-8")
    run("git", "-C", str(staging), "init", "-b", "gh-pages")
    run("git", "-C", str(staging), "config", "user.name", OWNER)
    run("git", "-C", str(staging), "config", "user.email", "%s@users.noreply.github.com" % OWNER)
    run("git", "-C", str(staging), "add", "-A", "-f")
    run("git", "-C", str(staging), "commit", "-m", "Deploy the ProphetSyndicate tranche desk")
    run("git", "-C", str(staging), "push", "--force", remote, "gh-pages")
    print("pushed gh-pages")
    run("git", "-C", str(staging), "remote", "remove", "origin")
    return 0


if __name__ == "__main__":
    sys.exit(main())
