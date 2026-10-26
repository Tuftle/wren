#!/usr/bin/env python3
"""Draws the alternative app icons that Settings > Appearance offers (browser/components/shell/icons).

    python tools/wren/make_app_icons.py

Needs Pillow and Google Chrome (to draw the SVGs), like make_branding.py.
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
from make_branding import ROOT, draw_svg  # noqa: E402

OUT = os.path.join(ROOT, "browser", "components", "shell", "icons")

# the bird, in the 128-unit box of the main logo; the pieces are named so each style can colour them
BODY = '<ellipse cx="62" cy="74" rx="28" ry="21"/><circle cx="42" cy="57" r="14"/>' \
       '<path d="M84 72C97 68 102 50 99 32c-1-4-7-3-7 1 0 14-6 22-17 27z"/>'
BEAK = '<path d="M30 54L16 52l13 8z"/>'
LEGS = '<path d="M54 92v7M68 92v7" stroke-width="3.5" stroke-linecap="round" fill="none"/>'
BELLY = '<path d="M52 70c8-6 22-5 30 4-8 10-26 10-34 1 1-2 2-3 4-5z"/>'


def svg(body, size=128):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="{size}" height="{size}">{body}</svg>'


def retro2004():
    """A glossy little web-2003 button: bright colours, a thick outline and a shine."""
    return svg(f'''
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fd0ff"/><stop offset="1" stop-color="#1b6fe0"/></linearGradient>
  <linearGradient id="fur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb43a"/><stop offset="1" stop-color="#e2641a"/></linearGradient>
  <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient>
  <clipPath id="tile"><rect x="6" y="6" width="116" height="116" rx="30"/></clipPath>
</defs>
<rect x="8" y="10" width="116" height="116" rx="30" fill="#0d2f6b" opacity=".45"/>
<rect x="6" y="6" width="116" height="116" rx="30" fill="url(#sky)" stroke="#0b3a9c" stroke-width="5"/>
<g clip-path="url(#tile)"><ellipse cx="64" cy="14" rx="86" ry="46" fill="url(#shine)"/></g>
<circle cx="26" cy="104" r="6" fill="#ff4d4d" stroke="#fff" stroke-width="2"/><circle cx="104" cy="22" r="5" fill="#ffd93b" stroke="#fff" stroke-width="2"/>
<circle cx="108" cy="100" r="6" fill="#4fd05a" stroke="#fff" stroke-width="2"/>
<g fill="url(#fur)" stroke="#5a2406" stroke-width="5" stroke-linejoin="round">{BODY}{BEAK.replace('<path', '<path fill="#ffe14a"')}</g>
<g stroke="#5a2406" stroke-width="5" stroke-linecap="round" fill="none"><path d="M54 92v8M68 92v8"/></g>
<g fill="#fff6c8" stroke="#5a2406" stroke-width="3" stroke-linejoin="round">{BELLY}</g>
<g fill="url(#fur)"><ellipse cx="55" cy="68" rx="14" ry="6" fill="#fff" opacity=".35"/></g>
<circle cx="38" cy="54" r="4.4" fill="#fff" stroke="#5a2406" stroke-width="2"/><circle cx="38.8" cy="54.4" r="2.2" fill="#2a1204"/>
''')


def retro2017():
    """Bold and tilted, with a heavy white outline and a hard shadow, like a 2012 game logo."""
    group = f'<g transform="rotate(-9 64 64) translate(0 -2)">'
    return svg(f'''
<defs><linearGradient id="red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a36"/><stop offset="1" stop-color="#c8231a"/></linearGradient></defs>
<g transform="translate(4 5)" opacity=".35" fill="#000" stroke="#000" stroke-width="16" stroke-linejoin="round">{group}{BODY}{BEAK}</g></g>
{group}
  <g fill="#a3160f" stroke="#a3160f" stroke-width="18" stroke-linejoin="round">{BODY}{BEAK}</g>
  <g fill="#fff" stroke="#fff" stroke-width="13" stroke-linejoin="round">{BODY}{BEAK}</g>
  <g fill="url(#red)" stroke="#ec3b26" stroke-width="2" stroke-linejoin="round">{BODY}{BEAK}</g>
  <g stroke="#fff" fill="none" stroke-width="9" stroke-linecap="round"><path d="M54 92v9M68 92v9"/></g>
  <g stroke="#a3160f" fill="none" stroke-width="3.5" stroke-linecap="round"><path d="M54 94v6M68 94v6"/></g>
  <g fill="#fff">{BELLY}</g>
  <circle cx="38" cy="54" r="4" fill="#fff"/><circle cx="38.6" cy="54.4" r="2.2" fill="#2a0a06"/>
</g>
''')


def minimal(color):
    return svg(f'<g fill="{color}" stroke="{color}" stroke-width="2" stroke-linejoin="round">{BODY}{BEAK}</g>'
               f'<g stroke="{color}" fill="none" stroke-width="3.5" stroke-linecap="round"><path d="M54 92v7M68 92v7"/></g>')


def nook():
    return svg('''
<rect x="6" y="6" width="116" height="116" rx="30" fill="#f4efe6"/>
<path d="M36 94V62c0-17 11-28 28-28s28 11 28 28v32h-14V64c0-8-5-14-14-14s-14 6-14 14v30z" fill="#8a4b2a"/>
<circle cx="64" cy="102" r="0"/>''')


def pixel():
    art = [
        "................",
        "................",
        ".............##.",
        ".............##.",
        "....####.....##.",
        "...#####....###.",
        ".###E####..###..",
        "...########.##..",
        "...###########..",
        "....####oooo##..",
        "....###ooooo##..",
        ".....########...",
        "......#..#......",
        "......#..#......",
        "................",
        "................",
    ]
    colors = {"#": "#f4efe6", "o": "#e0a870", "E": "#7a3f20"}
    cells = []
    for y, row in enumerate(art):
        for x, ch in enumerate(row):
            if ch in colors:
                cells.append(f'<rect x="{8 + x * 7}" y="{8 + y * 7}" width="7.1" height="7.1" fill="{colors[ch]}"/>')
    return svg('<rect x="6" y="6" width="116" height="116" rx="14" fill="#8a4b2a"/>' + "".join(cells))


def egg():
    return svg('''
<defs><radialGradient id="e" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#d9c7a5"/></radialGradient></defs>
<rect x="6" y="6" width="116" height="116" rx="30" fill="#8a4b2a"/>
<ellipse cx="64" cy="112" rx="30" ry="5" fill="#000" opacity=".25"/>
<path d="M64 14C42 14 28 48 28 72c0 22 15 36 36 36s36-14 36-36c0-24-14-58-36-58z" fill="url(#e)"/>
<g fill="#b99a72" opacity=".7"><circle cx="46" cy="70" r="3"/><circle cx="82" cy="60" r="2.5"/><circle cx="74" cy="88" r="3.5"/><circle cx="52" cy="92" r="2.5"/><circle cx="62" cy="48" r="2"/></g>
<path d="M36 58l12 8 10-10 10 10 10-10 12 8" stroke="#e0a870" stroke-width="4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>''')


ICONS = {
    "retro2004": retro2004(),
    "retro2017": retro2017(),
    "minimal-dark": minimal("#f4efe6"),
    "minimal-light": minimal("#6f3b20"),
    "kit": nook(),
    "pixelated": pixel(),
    "momo": egg(),
}


def main():
    with tempfile.TemporaryDirectory() as tmp:
        for name, source in ICONS.items():
            path = os.path.join(tmp, name + ".svg")
            with open(path, "w", encoding="utf-8") as f:
                f.write(source)
            img = draw_svg(path, 512)
            img.save(os.path.join(OUT, name + ".ico"), format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
            img.save(os.path.join(os.environ.get("PREVIEW_DIR", tmp), name + ".png"))
            print("wrote", name)


if __name__ == "__main__":
    main()
