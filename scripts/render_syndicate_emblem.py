#!/usr/bin/env python3
"""Render the ProphetSyndicate emblem: a senior shield arc over a junior sleeve.
The mark is drawn from the same tranche waterfall the intelligent contract
settles, so the ratios on the ring are the deployed senior and junior split of a
senior 6 GEN / junior 3 GEN vault under the HIGH CONVICTION band.
    .venv/bin/python scripts/render_syndicate_emblem.py
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parent.parent
SIZE = 512
SUPERSAMPLE = 4
CANVAS = SIZE * SUPERSAMPLE
OBSIDIAN = (5, 11, 10)
PANEL = (12, 23, 21)
RIDGE = (18, 37, 31)
SENIOR = (16, 185, 129)
JUNIOR = (56, 189, 248)
REBALANCE = (245, 158, 11)
IVORY = (215, 229, 223)
def scaled(value: float) -> int:
    return int(round(value * SUPERSAMPLE))
def ring(draw: ImageDraw.ImageDraw, centre: tuple[float, float], radius: float, start: float, sweep: int, colour, width: float) -> None:
    box = [
        scaled(centre[0] - radius),
        scaled(centre[1] - radius),
        scaled(centre[0] + radius),
        scaled(centre[1] + radius),
    ]
    draw.arc(box, start=start, end=start + sweep, fill=colour, width=scaled(width))
def dot(draw: ImageDraw.ImageDraw, centre: tuple[float, float], radius: float, colour) -> None:
    draw.ellipse(
        [
            scaled(centre[0] - radius),
            scaled(centre[1] - radius),
            scaled(centre[0] + radius),
            scaled(centre[1] + radius),
        ],
        fill=colour,
    )
def render() -> Image.Image:
    image = Image.new("RGB", (CANVAS, CANVAS), OBSIDIAN)
    draw = ImageDraw.Draw(image)
    centre = (SIZE / 2, SIZE / 2)
    # tranche grid, faint as a desk backplate
    for step in range(0, SIZE, 32):
        draw.line([(scaled(step), 0), (scaled(step), CANVAS)], fill=PANEL, width=max(1, scaled(0.6)))
        draw.line([(0, scaled(step)), (CANVAS, scaled(step))], fill=PANEL, width=max(1, scaled(0.6)))
    # outer casing, the custody vault wall
    ring(draw, centre, 236, 0, 360, RIDGE, 3)
    ring(draw, centre, 214, 0, 360, RIDGE, 10)
    # senior protection arc: 66.7 percent of locked principal
    senior_share = 6 / 9
    senior_sweep = int(270 * senior_share)
    ring(draw, centre, 178, -135, senior_sweep, SENIOR, 26)
    # junior first loss arc: the remaining 30 percent of the same span
    ring(draw, centre, 178, -135 + senior_sweep, 270 - senior_sweep, JUNIOR, 26)
    # routed deployment wedge into ProphetGrid market making, 80 percent
    ring(draw, centre, 138, -135, int(270 * 0.8), REBALANCE, 12)
    ring(draw, centre, 138, -135 + int(270 * 0.8), int(270 * 0.2), RIDGE, 12)
    # the waterfall spine: senior floor above junior capital
    draw.line(
        [(scaled(centre[0]), scaled(centre[1] - 40)), (scaled(centre[0]), scaled(centre[1] + 96))],
        fill=IVORY,
        width=scaled(3),
    )
    for offset, colour in ((-40, SENIOR), (0, REBALANCE), (56, JUNIOR)):
        dot(draw, (centre[0], centre[1] + offset), 9, colour)
    # shield mark inside the senior arc
    shield = [
        (centre[0] - 34, centre[1] - 132),
        (centre[0] + 34, centre[1] - 132),
        (centre[0] + 26, centre[1] - 92),
        (centre[0], centre[1] - 74),
        (centre[0] - 26, centre[1] - 92),
    ]
    draw.polygon([(scaled(x), scaled(y)) for x, y in shield], outline=SENIOR, width=scaled(3))
    # centre plate with the epoch ledger notch
    draw.rounded_rectangle(
        [scaled(centre[0] - 62), scaled(centre[1] + 118), scaled(centre[0] + 62), scaled(centre[1] + 160)],
        radius=scaled(8),
        fill=PANEL,
        outline=RIDGE,
        width=scaled(2),
    )
    for index in range(4):
        draw.line(
            [(scaled(centre[0] - 46 + index * 26), scaled(centre[1] + 128)), (scaled(centre[0] - 46 + index * 26), scaled(centre[1] + 150))],
            fill=SENIOR if index % 2 == 0 else JUNIOR,
            width=scaled(5),
        )
    return image.resize((SIZE, SIZE), Image.LANCZOS)
def main() -> None:
    logo = render()
    targets = [ROOT / "frontend" / "public" / "logo.png", ROOT / "docs" / "logo.png"]
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        logo.save(target, format="PNG", optimize=True)
        print("wrote %s (%d bytes)" % (target.relative_to(ROOT), target.stat().st_size))
if __name__ == "__main__":
    main()
