#!/usr/bin/env python3
"""Generate the Duplicate Tab Finder icons.

The mark is the same tab twice: a muted duplicate behind, the kept tab in front,
tagged with the red used for the "Remove duplicates" button in the popup. It
still reads as "two of the same thing, keep one" at 16px in the toolbar, and as
a finished app tile at 128px. Colors come straight from popup.css so the icon
matches the product.

Run it from the repository root (needs Pillow):

    python3 -m pip install pillow
    python3 tools/generate_icons.py

Both outputs come from the geometry below, so the vector master and the raster
icons can never drift apart:

    assets/icon.svg           vector master
    assets/icons/icon-16.png  toolbar (badge dropped: at 16px it is a smudge)
    assets/icons/icon-32.png  HiDPI toolbar
    assets/icons/icon-48.png  chrome://extensions
    assets/icons/icon-128.png install dialog and Chrome Web Store
"""

from pathlib import Path

from PIL import Image, ImageDraw

CANVAS = 128  # design units; matches the SVG viewBox
SUPERSAMPLE = 8  # draw large, then shrink for smooth edges

TILE_COLOR = "#277356"  # popup accent green
TAB_COLOR = "#ffffff"  # the tab that stays open
DUPLICATE_COLOR = "#8cb4a4"  # the duplicate sitting behind it
BADGE_COLOR = "#a9493e"  # popup danger red

TILE_BOX = (0, 0, 128, 128)  # (left, top, right, bottom) in design units
TILE_RADIUS = 28

# Painted in order: the duplicate first, then the kept tab on top of it. Equal
# size and equal corner radius, so they read as the same tab drawn twice.
TABS = (
    {"fill": DUPLICATE_COLOR, "body": (12, 24, 88, 80), "radius": 12},
    {"fill": TAB_COLOR, "body": (39, 48, 115, 104), "radius": 12},
)

# The "close the extras" mark. A tile-colored ring cuts it out of the tab.
BADGE_CENTER = (106, 105)
BADGE_RING_RADIUS = 18.5
BADGE_RADIUS = 15
BADGE_BAR_BOX = (93.5, 98.5, 118.5, 111.5)
BADGE_BAR_RADIUS = 6.5

# size: draw the badge. The artwork is not rescaled per size: it already fills
# the tile, and the duplicate reads at 16px as drawn.
SIZES = {16: False, 32: True, 48: True, 128: True}

ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "assets" / "icons"
SVG_PATH = ROOT / "assets" / "icon.svg"


def render_png(size, include_badge):
    unit = (size * SUPERSAMPLE) / CANVAS
    image = Image.new("RGBA", (size * SUPERSAMPLE,) * 2, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def box(shape):
        return tuple(value * unit for value in shape)

    draw.rounded_rectangle(box(TILE_BOX), radius=TILE_RADIUS * unit, fill=TILE_COLOR)

    for tab in TABS:
        draw.rounded_rectangle(
            box(tab["body"]), radius=tab["radius"] * unit, fill=tab["fill"]
        )

    if include_badge:
        center_x, center_y = (value * unit for value in BADGE_CENTER)
        circles = ((BADGE_RING_RADIUS, TILE_COLOR), (BADGE_RADIUS, BADGE_COLOR))
        for radius, fill in circles:
            reach = radius * unit
            draw.ellipse(
                (center_x - reach, center_y - reach, center_x + reach, center_y + reach),
                fill=fill,
            )
        draw.rounded_rectangle(
            box(BADGE_BAR_BOX), radius=BADGE_BAR_RADIUS * unit, fill=TAB_COLOR
        )

    return image.resize((size, size), Image.LANCZOS)


def number(value):
    return f"{value:.2f}".rstrip("0").rstrip(".")


def svg_rect(box, fill, radius=None):
    left, top, right, bottom = box
    rx = f' rx="{number(radius)}"' if radius else ""
    return (
        f'  <rect x="{number(left)}" y="{number(top)}"'
        f' width="{number(right - left)}" height="{number(bottom - top)}"{rx}'
        f' fill="{fill}" />'
    )


def render_svg():
    center_x, center_y = BADGE_CENTER
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"'
        ' width="128" height="128" role="img"'
        ' aria-labelledby="duplicate-tab-finder-title">',
        '  <title id="duplicate-tab-finder-title">Duplicate Tab Finder</title>',
        f'  <rect width="128" height="128" rx="{number(TILE_RADIUS)}"'
        f' fill="{TILE_COLOR}" />',
    ]

    for tab in TABS:
        lines.append(svg_rect(tab["body"], tab["fill"], tab["radius"]))

    lines.append(
        f'  <circle cx="{number(center_x)}" cy="{number(center_y)}"'
        f' r="{number(BADGE_RING_RADIUS)}" fill="{TILE_COLOR}" />'
    )
    lines.append(
        f'  <circle cx="{number(center_x)}" cy="{number(center_y)}"'
        f' r="{number(BADGE_RADIUS)}" fill="{BADGE_COLOR}" />'
    )
    lines.append(svg_rect(BADGE_BAR_BOX, TAB_COLOR, BADGE_BAR_RADIUS))
    lines.append("</svg>")

    return "\n".join(lines) + "\n"


def main():
    ICON_DIR.mkdir(parents=True, exist_ok=True)

    for size, include_badge in SIZES.items():
        path = ICON_DIR / f"icon-{size}.png"
        icon = render_png(size, include_badge)
        icon.save(path, optimize=True)
        print(f"{path.relative_to(ROOT)}  {icon.width}x{icon.height}px")

    SVG_PATH.write_text(render_svg(), encoding="utf-8")
    print(f"{SVG_PATH.relative_to(ROOT)}  vector master")


if __name__ == "__main__":
    main()
