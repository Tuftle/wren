#!/usr/bin/env python3
"""Swaps Firefox's mascot art and Firefox logos for Wren's own art.

    python tools/wren/replace_art.py

Mozilla's license does not let a fork ship the fox and the Firefox logo. The files below are
overwritten in place with the same size and the same name, so nothing else needs to change. After
pulling in Mozilla's updates, run this again: new fox art that shows up upstream only needs its
path added to the lists.
"""
import os
import re
import subprocess
import sys
import tempfile

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import art_scenes  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CHROME = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
LOGO = os.path.join(ROOT, "browser", "branding", "wren", "content", "about-logo.svg")

# small one-colour interface icons: a plain bird that takes the colour the browser gives it
ICONS = [
    "browser/base/content/logos/share-firefox.svg",
    "browser/themes/shared/fxa/avatar-fox-circle.svg",
    "browser/themes/shared/fxa/avatar-fox.svg",
    "browser/themes/shared/icons/firefox-view.svg",
    "browser/themes/shared/icons/window-firefox.svg",
    "browser/themes/shared/sidebar/firefox.svg",
    "browser/themes/shared/sidebar/foxy.svg",
]
# the Firefox logo itself: Wren's logo instead
LOGOS = [
    "browser/extensions/newtab/data/content/assets/firefox.svg",
    "browser/components/aboutwelcome/assets/splash-logo.svg",
]
# coloured illustrations and mascot pictures: Wren's bird on a soft glow
ILLUSTRATIONS = [
    "browser/components/aboutwelcome/assets/br-amo-fox-paint.svg",
    "browser/components/aboutwelcome/assets/br-backup-fox-in-box.svg",
    "browser/components/aboutwelcome/assets/br-backup-fox-outside-box.svg",
    "browser/components/aboutwelcome/assets/br-fxa-fox-mirror.svg",
    "browser/components/aboutwelcome/assets/br-gratitude-fox-rock.svg",
    "browser/components/aboutwelcome/assets/br-import-fox-house.svg",
    "browser/components/aboutwelcome/assets/br-migration-fox-juggle.svg",
    "browser/components/aboutwelcome/assets/br-set-default-fox-heart.svg",
    "browser/components/aboutwelcome/assets/fox-doodle-backup-restore.svg",
    "browser/components/asrouter/content/assets/fox-with-box-on-cloud.svg",
    "browser/components/asrouter/content/assets/fox-with-checkmark.svg",
    "browser/components/asrouter/content/assets/fox-with-devices.svg",
    "browser/components/asrouter/content/assets/fox-with-locked-box.svg",
    "browser/components/asrouter/content/assets/fox-with-mobile.svg",
    "browser/components/asrouter/content/assets/fox-with-profiles.svg",
    "browser/components/asrouter/content/assets/smiling-fox-icon.svg",
    "browser/components/controlcenter/content/assets/fox-concern.svg",
    "browser/components/firefoxview/content/history-empty.svg",
    "browser/components/firefoxview/content/synced-tabs-empty.svg",
    "browser/components/firefoxview/content/synced-tabs-error.svg",
    "browser/extensions/newtab/data/content/assets/firefox-mascot-prop-heart-dark-narrow.svg",
    "browser/extensions/newtab/data/content/assets/firefox-mascot-prop-heart-dark-responsive.svg",
    "browser/extensions/newtab/data/content/assets/firefox-mascot-prop-heart-dark.svg",
    "browser/extensions/newtab/data/content/assets/firefox-mascot-prop-heart-light-narrow.svg",
    "browser/extensions/newtab/data/content/assets/firefox-mascot-prop-heart-light-responsive.svg",
    "browser/extensions/newtab/data/content/assets/firefox-mascot-prop-heart-light.svg",
    "browser/extensions/newtab/data/content/assets/firefox-mascot-prop-paintbucket-rgb.svg",
    "browser/extensions/newtab/data/content/assets/firefox-motion-head-pop-up-no-bg.svg",
    "browser/extensions/newtab/data/content/assets/highlights/firefox-mascot-prop-paintbucket-rgb.svg",
    "browser/extensions/newtab/data/content/assets/puzzle-fox.svg",
    "browser/themes/shared/preferences/fox-ai.svg",
    "toolkit/components/satchel/megalist/content/icons/cpm-fox-illustration.svg",
]
# the same kind of picture, as bitmaps
BITMAPS = [
    "browser/components/aboutwelcome/assets/fox-doodle-tail.png",
    "browser/components/aboutwelcome/assets/fox-doodle-waving-static.png",
    "browser/components/aboutwelcome/assets/fox-doodle-waving.gif",
]
# more of the same, whose names do not say "fox" or "kit"
EXTRA_ILLUSTRATIONS = [
    "browser/components/aiwindow/ui/assets/set-default-onboarding.svg",
    "browser/components/aiwindow/ui/assets/smart-window-promo-default.svg",
    "browser/components/aiwindow/ui/assets/agent-watch-empty.svg",
    "browser/components/ipprotection/assets/vpn-settings-get-started.svg",
    "browser/extensions/newtab/data/content/assets/widgets-cta.svg",
    "browser/extensions/newtab/data/content/assets/world-cup-widgets-cta.svg",
    "browser/themes/shared/addons/extensions-panel-empty-onboarding.svg",
    "browser/themes/shared/addons/extensions-panel-empty.svg",
    "browser/themes/shared/identity-block/trustpanel-graphic-warning.svg",
    "browser/themes/shared/identity-block/trustpanel-graphic-enabled.svg",
    "browser/themes/shared/illustrations/tab-groups.svg",
    "toolkit/themes/shared/illustrations/security-error.svg",
    "toolkit/themes/shared/illustrations/no-connection.svg",
    "toolkit/mozapps/defaultagent/assets/default-browser-notification-privacy-image.svg",
]
EXTRA_BITMAPS = [
    "browser/fxr/content/assets/icon-logo-settings-preview.png",
    "browser/extensions/newtab/data/content/assets/highlights/widget-survey.webp",
    "browser/extensions/newtab/data/content/assets/highlights/wallpaper-callout.png",
    "browser/extensions/newtab/data/content/assets/highlights/widget-worldcup.png",
    "browser/extensions/newtab/data/content/assets/highlights/widget-non-worldcup.png",
]
# Firefox's mascot is called "Kit": everything named for it is found by name
KIT = re.compile(r"(^|[-_/])kit([-_.]|$)")


def kit_files():
    names = subprocess.check_output(["git", "ls-files", "browser", "toolkit"], text=True, cwd=ROOT).splitlines()
    skip = re.compile(r"/tests?/|testing|/locales/|devtools|/docs/|branding/")
    return [n for n in names
            if re.search(r"\.(svg|png|gif|webp)$", n) and KIT.search(os.path.basename(n)) and not skip.search(n)]


# the fox tail on the private browsing page: a plain soft hill
HILLS = ["browser/themes/shared/privatebrowsing/fox-tail.svg"]

# the bird, in a 128 x 128 box; it occupies x 16..102 and y 29..99
BIRD = """<ellipse cx="62" cy="74" rx="28" ry="21" fill="{body}"/>
<circle cx="42" cy="57" r="14" fill="{body}"/>
<path d="M84 72C97 68 102 50 99 32c-1-4-7-3-7 1 0 14-6 22-17 27z" fill="{body}"/>
<path d="M30 54L16 52l13 8z" fill="{body}"/>
<path d="M54 92v7M68 92v7" stroke="{body}" stroke-width="3.5" stroke-linecap="round"/>
<path d="M52 70c8-6 22-5 30 4-8 10-26 10-34 1 1-2 2-3 4-5z" fill="{wing}"/>
<circle cx="38" cy="54" r="2.6" fill="{eye}"/>"""
BBOX_W, CENTER = 86, (59, 64)


def geometry(path):
    """The viewBox and the width and height attributes of an svg that is about to be replaced."""
    with open(path, encoding="utf-8", errors="ignore") as f:
        head = f.read(3000)
    tag = re.search(r"<svg\b[^>]*>", head, re.S)
    tag = tag.group(0) if tag else ""

    def attr(name):
        m = re.search(r'\s%s="([^"]*)"' % name, tag)
        return m.group(1) if m else None

    width, height, box = attr("width"), attr("height"), attr("viewBox")
    num = lambda v: float(re.match(r"[\d.]+", v).group(0)) if v and re.match(r"[\d.]+", v) else None
    if box:
        vx, vy, vw, vh = [float(x) for x in box.replace(",", " ").split()]
    else:
        vw, vh = num(width) or 100.0, num(height) or 100.0
        vx = vy = 0.0
    return (vx, vy, vw, vh), width, height


def wrap(box, width, height, inner):
    vx, vy, vw, vh = box
    size = ""
    if width and height and "%" not in width + height:
        size = f' width="{width}" height="{height}"'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx:g} {vy:g} {vw:g} {vh:g}"{size}>\n'
            f"{inner}\n</svg>\n")


def placed(box, fraction, bird):
    vx, vy, vw, vh = box
    scale = fraction * min(vw, vh) / BBOX_W
    tx = vx + vw / 2 - CENTER[0] * scale
    ty = vy + vh / 2 - CENTER[1] * scale
    return f'<g transform="translate({tx:.2f} {ty:.2f}) scale({scale:.4f})">\n{bird}\n</g>'


def icon_svg(box, width, height):
    bird = BIRD.format(body="context-fill", wing="none", eye="none")
    return wrap(box, width, height, placed(box, 0.92, bird))


def illustration_svg(box, width, height, name=""):
    """One of Wren's scenes (see art_scenes.py), chosen by what the picture is for, on a soft glow."""
    vx, vy, vw, vh = box
    small = min(vw, vh) <= 64
    scene = art_scenes.SCENES["avatar" if small else art_scenes.scene_for(name)]()
    scale = (0.98 if small else 0.94) * min(vw, vh) / 200
    tx = vx + vw / 2 - 100 * scale
    ty = vy + vh / 2 - 100 * scale
    r = 0.42 * min(vw, vh)
    glow = f'<circle cx="{vx + vw / 2:g}" cy="{vy + vh / 2:g}" r="{r:g}" fill="#e0a870" fill-opacity=".16"/>'
    group = f'<g transform="translate({tx:.2f} {ty:.2f}) scale({scale:.4f})">{scene}</g>'
    return wrap(box, width, height, glow + "\n" + group)


def logo_svg():
    with open(LOGO, encoding="utf-8") as f:
        text = f.read()
    return re.sub(r'\s(width|height)="[^"]*"', "", text, count=2)


def hill_svg(box, width, height):
    vx, vy, vw, vh = box
    d = (f"M{vx:g} {vy + vh:g}C{vx + vw * .25:g} {vy + vh * .78:g} {vx + vw * .5:g} {vy + vh * .95:g} "
         f"{vx + vw * .72:g} {vy + vh * .62:g}S{vx + vw * .95:g} {vy + vh * .5:g} {vx + vw:g} {vy + vh * .42:g}"
         f"V{vy + vh:g}Z")
    return wrap(box, width, height, f'<path d="{d}" fill="#8a7b6b" fill-opacity=".35"/>')


def rasterise(svg_text, w, h):
    with tempfile.TemporaryDirectory() as tmp:
        svg, html, out = (os.path.join(tmp, n) for n in ("a.svg", "p.html", "o.png"))
        with open(svg, "w", encoding="utf-8") as f:
            f.write(svg_text)
        with open(html, "w", encoding="utf-8") as f:
            f.write('<!doctype html><body style="margin:0;background:transparent">'
                    f'<img src="file:///{svg.replace(os.sep, "/")}" width="{w}" height="{h}" style="display:block"></body>')
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--default-background-color=00000000", f"--window-size={w},{h}",
                        f"--screenshot={out}", "file:///" + html.replace(os.sep, "/")],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return Image.open(out).convert("RGBA")


def write(rel, text):
    with open(os.path.join(ROOT, rel), "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def main():
    done = 0
    for rel in ICONS:
        box, w, h = geometry(os.path.join(ROOT, rel))
        write(rel, icon_svg(box, w, h))
        done += 1
    for rel in LOGOS:
        write(rel, logo_svg())
        done += 1
    kits = kit_files()
    for rel in ILLUSTRATIONS + EXTRA_ILLUSTRATIONS + [k for k in kits if k.endswith(".svg")]:
        box, w, h = geometry(os.path.join(ROOT, rel))
        write(rel, illustration_svg(box, w, h, os.path.basename(rel)))
        done += 1
    for rel in HILLS:
        box, w, h = geometry(os.path.join(ROOT, rel))
        write(rel, hill_svg(box, w, h))
        done += 1
    for rel in BITMAPS + EXTRA_BITMAPS + [k for k in kits if not k.endswith(".svg")]:
        path = os.path.join(ROOT, rel)
        old = Image.open(path)
        size = old.size
        art = rasterise(illustration_svg((0, 0, size[0], size[1]), None, None, os.path.basename(rel)), *size)
        if rel.endswith(".webp"):
            art.save(path, format="WEBP", lossless=True)
        elif rel.endswith(".gif"):
            flat = Image.new("RGBA", art.size, (244, 239, 230, 255))
            flat.alpha_composite(art)
            art = flat
            art.convert("RGB").save(path, format="GIF")
        else:
            art.save(path)
        done += 1
    print(f"replaced {done} files")


if __name__ == "__main__":
    sys.exit(main())
