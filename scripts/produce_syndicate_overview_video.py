#!/usr/bin/env python3
"""Produce the ProphetSyndicate overview video with burned in subtitles.

The desk is rendered live at 1280x720 against the deployed studionet vault, the
browser session is recorded by Playwright, an ambient quant desk bed is
synthesised with numpy, and ffmpeg muxes the two with a subtitle track. Nothing
here is a mock: every number on screen is read from the intelligent contract.

    .venv/bin/python scripts/produce_syndicate_overview_video.py
"""

from __future__ import annotations

import math
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
SCRATCH = ROOT / ".venv" / "video-scratch"
OUT_DOC = ROOT / "docs" / "demo-video-subtitled.mp4"
OUT_SITE = FRONTEND / "public" / "demo-video-subtitled.mp4"
PORT = 4173
URL = "http://127.0.0.1:%d/prophet-syndicate/" % PORT
WIDTH, HEIGHT, FPS = 1280, 720, 25
AMBIENT_SECONDS = 52

# seconds of dwell, then the caption that is burned over that beat
SCENES = [
    (7, "ProphetSyndicate: senior and junior tranche custody for the ProphetGrid ecosystem"),
    (7, "The vault holds funded GEN custody. PST receipts mint one to one against locked principal"),
    (8, "Every routing epoch is a live validator decision over a macro volatility print and the linked market depth"),
    (8, "Four discrete bands decide how much liquidity markets ProphetGrid and how much stays in the senior shield"),
    (8, "The stress modeler replays the exact integer allocation model that settles on chain"),
    (8, "Rejected payable calls never trap value. A refused bond stays claimable to the cent"),
    (8, "Zero utilization and un audited epochs release one hundred percent of principal, penalty free"),
]


def ambient_wav(path: Path, seconds: int) -> None:
    """Slow quant desk bed: two detuned drones, a sub pulse and filtered ticking."""
    rate = 44100
    total = rate * seconds
    frames = bytearray()
    for index in range(total):
        t = index / rate
        drone = 0.20 * math.sin(2 * math.pi * 55.0 * t) + 0.13 * math.sin(2 * math.pi * 82.5 * t)
        pad = 0.09 * math.sin(2 * math.pi * 220.0 * t + 1.4 * math.sin(2 * math.pi * 0.07 * t))
        pulse = 0.10 * math.sin(2 * math.pi * 110.0 * t) * max(0.0, 1.0 - (t % 2.0) * 1.4)
        tick = 0.05 * math.sin(2 * math.pi * 1320.0 * t) if int(t * 2) % 4 == 0 and (t * 2) % 1 < 0.06 else 0.0
        swell = 0.55 + 0.45 * math.sin(2 * math.pi * t / AMBIENT_SECONDS)
        sample = (drone + pad + pulse + tick) * swell
        sample = max(-0.95, min(0.95, sample))
        frames += struct.pack("<h", int(sample * 32767))
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(bytes(frames))


CAPTION = """[Script Info]
ScriptType: v4.00+
PlayResX: %d
PlayResY: %d
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Desk,DejaVu Sans,28,&H00FBEFE6,&H000000FF,&H00051A16,&H96000000,-1,0,0,0,100,100,0,0,1,2,1,2,60,60,44,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, Effect, Text
"""


def timeline_ass(path: Path) -> None:
    cursor = 1.2
    lines = []
    for dwell, text in SCENES:
        start = format_time(cursor)
        end = format_time(cursor + dwell - 0.4)
        lines.append("Dialogue: 0,%s,%s,Desk,,,,%s" % (start, end, text.upper()))
        cursor += dwell
    path.write_text(CAPTION % (WIDTH, HEIGHT) + "\n".join(lines) + "\n", encoding="utf-8")


def format_time(seconds: float) -> str:
    tenths = int(round(seconds * 10))
    return "%d:%02d:%02d.%d" % (tenths // 36000, tenths // 600 % 60, tenths // 10 % 60, tenths % 10)


CAPTURE_SCRIPT = """
import { chromium } from "playwright";

const scenes = JSON.parse(process.argv[2]);
const outDir = process.argv[3];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: %d, height: %d },
  recordVideo: { dir: outDir, size: { width: %d, height: %d } },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
await page.goto(process.argv[4], { waitUntil: "networkidle", timeout: 120000 });
await wait(6000);

for (const scene of scenes) {
  if (scene.target) {
    await page.evaluate((selector) => {
      const node = document.querySelector(selector);
      if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
    }, scene.target);
  }
  if (scene.action === "hover") {
    await page.hover(scene.target).catch(() => {});
  }
  if (scene.action === "scroll") {
    await page.mouse.wheel(0, scene.delta);
  }
  if (scene.action === "type") {
    await page.fill(scene.target, scene.value).catch(() => {});
  }
  await wait(scene.dwell * 1000);
}
await context.close();
await browser.close();
"""


def capture(webm_dir: Path) -> Path:
    import json

    scenes = [
        {"dwell": SCENES[0][0], "target": "header", "action": "hover"},
        {"dwell": SCENES[1][0], "target": ".pane:nth-of-type(2)", "action": "scroll", "delta": 260},
        {"dwell": SCENES[2][0], "target": "article", "action": "hover"},
        {"dwell": SCENES[3][0], "target": "article", "action": "scroll", "delta": 420},
        {"dwell": SCENES[4][0], "target": "select", "action": "type", "value": "6500"},
        {"dwell": SCENES[5][0], "target": ".action-ghost", "action": "hover"},
        {"dwell": SCENES[6][0] - 2, "target": "footer, .mono", "action": "scroll", "delta": 600},
    ]
    # node resolves bare specifiers from the script location, so it must live in frontend
    script = FRONTEND / "_capture_desk.mjs"
    script.write_text(CAPTURE_SCRIPT % (WIDTH, HEIGHT, WIDTH, HEIGHT), encoding="utf-8")
    env = dict(os.environ)
    recordings = webm_dir / "recordings"
    recordings.mkdir(parents=True, exist_ok=True)
    try:
        completed = subprocess.run(
            ["node", str(script), json.dumps(scenes), str(recordings), URL],
            cwd=str(FRONTEND),
            env=env,
            capture_output=True,
            text=True,
        )
    finally:
        script.unlink(missing_ok=True)
    if completed.returncode != 0:
        print(completed.stdout[-1500:])
        print(completed.stderr[-1500:])
        raise SystemExit("playwright capture failed")
    tapes = sorted((webm_dir / "recordings").glob("*.webm"), key=lambda item: item.stat().st_mtime)
    if not tapes:
        raise SystemExit("no recording produced")
    return tapes[-1]


def main() -> int:
    node = shutil.which("node")
    ffmpeg = shutil.which("ffmpeg")
    if not node or not ffmpeg:
        print("node and ffmpeg are both required")
        return 2
    SCRATCH.mkdir(parents=True, exist_ok=True)
    for stale in SCRATCH.iterdir():
        if stale.is_dir():
            shutil.rmtree(stale, ignore_errors=True)
        else:
            stale.unlink(missing_ok=True)

    audio = SCRATCH / "desk-bed.wav"
    print("synthesising the ambient desk bed")
    ambient_wav(audio, AMBIENT_SECONDS)

    captions = SCRATCH / "captions.ass"
    timeline_ass(captions)

    preview_log = SCRATCH / "preview.log"
    print("starting the built desk on http://127.0.0.1:%d" % PORT)
    with open(preview_log, "wb") as handle:
        preview = subprocess.Popen(
            ["node", "node_modules/vite/bin/vite.js", "preview", "--port", str(PORT), "--strictPort"],
            cwd=str(FRONTEND),
            stdout=handle,
            stderr=subprocess.STDOUT,
        )
    try:
        time.sleep(6)
        print("recording the live desk session")
        webm = capture(SCRATCH)
        print("captured", webm.name)
    finally:
        preview.terminate()

    total = 1.2 + sum(dwell for dwell, _ in SCENES) + 1.5
    duration = min(total, AMBIENT_SECONDS)
    print("muxing %ds of video with subtitles and audio" % duration)
    OUT_DOC.parent.mkdir(parents=True, exist_ok=True)
    fade_start = max(1, duration - 2)
    graph = (
        "[0:v]scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,fps=%d,"
        "trim=duration=%d,setpts=PTS-STARTPTS,subtitles=%s[v];"
        "[2:a]atrim=0:%d,afade=t=out:st=%d:d=2,aformat=sample_fmts=s16:channel_layouts=mono[a]"
        % (WIDTH, HEIGHT, WIDTH, HEIGHT, FPS, duration, captions, duration, fade_start)
    )
    command = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(webm), "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
        "-stream_loop", "-1", "-i", str(audio),
        "-filter_complex", graph,
        "-map", "[v]", "-map", "[a]", "-t", str(duration),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
        str(OUT_DOC),
    ]
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode != 0:
        print(completed.stderr[-2500:])
        return 1
    shutil.copy2(OUT_DOC, OUT_SITE.parent)
    OUT_SITE.write_bytes(OUT_DOC.read_bytes())
    size = OUT_DOC.stat().st_size
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(OUT_DOC)],
        capture_output=True,
        text=True,
    )
    print("wrote %s (%.1f MB, %ss) and %s" % (OUT_DOC.relative_to(ROOT), size / 1e6, probe.stdout.strip(), OUT_SITE.relative_to(ROOT)))
    if size > 15 * 1024 * 1024:
        print("WARNING: the video is above the 15 MB budget")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
