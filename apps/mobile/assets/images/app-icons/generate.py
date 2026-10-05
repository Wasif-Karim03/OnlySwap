"""Alternate app icons (R2-ICON-01), generated from the existing mark.

Run from apps/mobile:  python3 assets/images/app-icons/generate.py
Needs Pillow. Colors come from packages/tokens/tokens.json, the mark from
assets/images/android-icon-monochrome.png (white mark on transparent), so the
variants never drift from the real logo. No school names or marks.
"""

import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
MOBILE = HERE.parents[2]
TOKENS = json.loads((MOBILE.parent.parent / "packages/tokens/tokens.json").read_text())
LIGHT, DARK = TOKENS["color"]["light"], TOKENS["color"]["dark"]
ACCENT = TOKENS["color"]["accents"][TOKENS["color"]["defaultAccent"]]["accent"]

# name -> (background, mark). Must match ALT_ICONS in src/features/appIcon/logic.ts.
VARIANTS = {
    "night": (DARK["bg"], ACCENT),
    "paper": (LIGHT["bg"], LIGHT["ink"]),
    "mono": (DARK["card"], DARK["ink"]),
}

# The mark in icon.png spans ~474 px of 1024; in the adaptive foreground ~324 px.
IOS_SCALE = 474 / 324


def rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def tinted(alpha: Image.Image, color: str) -> Image.Image:
    layer = Image.new("RGBA", alpha.size, rgb(color) + (255,))
    layer.putalpha(alpha)
    return layer


def main() -> None:
    mono = Image.open(MOBILE / "assets/images/android-icon-monochrome.png").convert("RGBA")
    alpha = mono.getchannel("A")
    size = mono.size[0]
    big = int(round(size * IOS_SCALE))
    big_alpha = alpha.resize((big, big), Image.LANCZOS)
    off = (size - big) // 2
    big_alpha = big_alpha.crop((-off, -off, -off + size, -off + size))
    for name, (bg, fg) in VARIANTS.items():
        # iOS: full-bleed 1024 px, no transparency.
        ios = Image.new("RGBA", (size, size), rgb(bg) + (255,))
        ios.alpha_composite(tinted(big_alpha, fg))
        ios.convert("RGB").save(HERE / f"{name}.png", optimize=True)
        # Android adaptive foreground: same safe zone as android-icon-foreground.png.
        tinted(alpha, fg).save(HERE / f"{name}-foreground.png", optimize=True)


if __name__ == "__main__":
    main()
