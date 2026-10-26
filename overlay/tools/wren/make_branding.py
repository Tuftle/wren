#!/usr/bin/env python3
"""Regenerates every icon and image of the Wren branding from two SVG files.

    python tools/wren/make_branding.py

Needs Pillow and Google Chrome (to draw the SVGs). The sources are
browser/branding/wren/content/about-logo.svg (the logo) and
browser/branding/wren/content/about-logo-private.svg (private windows).
"""
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BRAND = os.path.join(ROOT, "browser", "branding", "wren")
CONTENT = os.path.join(BRAND, "content")
CHROME = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
CREAM, BROWN, SOFT = (244, 239, 230), (138, 75, 42), (138, 123, 107)

WORDMARK = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80" width="300" height="80">
  <text x="0" y="58" font-family="Georgia, 'Iowan Old Style', 'Palatino Linotype', serif" font-size="60" fill="{fill}">wren</text>
</svg>
"""


def draw_svg(svg_path, size):
    """Rasterise an SVG to a transparent RGBA image with headless Chrome."""
    with tempfile.TemporaryDirectory() as tmp:
        html = os.path.join(tmp, "p.html")
        out = os.path.join(tmp, "out.png")
        with open(html, "w", encoding="utf-8") as f:
            f.write(f'<!doctype html><body style="margin:0;background:transparent">'
                    f'<img src="file:///{svg_path.replace(os.sep, "/")}" width="{size}" height="{size}" style="display:block"></body>')
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
                        f"--window-size={size},{size}", f"--screenshot={out}", "file:///" + html.replace(os.sep, "/")],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return Image.open(out).convert("RGBA")


def save_png(img, name, size, folder=BRAND):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(folder, name))


def save_ico(img, name, sizes):
    img.save(os.path.join(BRAND, name), format="ICO", sizes=[(s, s) for s in sizes])


def font(size):
    for name in ("georgia.ttf", "GeorgiaPro-Regular.ttf", "times.ttf"):
        try:
            return ImageFont.truetype(os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", name), size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    logo_svg = os.path.join(CONTENT, "about-logo.svg")
    private_svg = os.path.join(CONTENT, "about-logo-private.svg")
    big = draw_svg(logo_svg, 1024)
    big_private = draw_svg(private_svg, 1024)

    for s in (16, 22, 24, 32, 48, 64, 128, 256):
        save_png(big, f"default{s}.png", s)
    # the about:* pages and the About dialog
    save_png(big, "about-logo.png", 192, CONTENT)
    save_png(big, "about-logo@2x.png", 384, CONTENT)
    save_png(big_private, "about-logo-private.png", 192, CONTENT)
    save_png(big_private, "about-logo-private@2x.png", 384, CONTENT)
    # the Windows start-menu tiles
    save_png(big, "VisualElements_70.png", 142)
    save_png(big, "VisualElements_150.png", 300)
    save_png(big_private, "PrivateBrowsing_70.png", 142)
    save_png(big_private, "PrivateBrowsing_150.png", 300)

    # Windows icons
    save_ico(big, "firefox.ico", (16, 32, 48, 256))
    save_ico(big, "firefox64.ico", (16, 32, 48, 64))
    save_ico(big, "document.ico", (16, 32, 48, 256))
    save_ico(big, "document_pdf.ico", (256,))
    save_ico(big, "newtab.ico", (16, 32))
    save_ico(big, "newwindow.ico", (16, 32))
    save_ico(big_private, "pbmode.ico", (16, 32, 48, 256))

    # the About dialog picture (300x236) and the installer's pictures
    about = Image.new("RGB", (300, 236), CREAM)
    about.paste(big.resize((120, 120), Image.LANCZOS), (90, 36), big.resize((120, 120), Image.LANCZOS))
    ImageDraw.Draw(about).text((150, 184), "wren", font=font(34), fill=BROWN, anchor="mm")
    about.save(os.path.join(CONTENT, "about.png"))

    head = Image.new("RGB", (150, 57), CREAM)
    mark = big.resize((40, 40), Image.LANCZOS)
    head.paste(mark, (96, 8), mark)
    head.save(os.path.join(BRAND, "wizHeader.bmp"))
    head.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(BRAND, "wizHeaderRTL.bmp"))

    mark_img = Image.new("RGB", (164, 314), CREAM)
    mark = big.resize((96, 96), Image.LANCZOS)
    mark_img.paste(mark, (34, 90), mark)
    ImageDraw.Draw(mark_img).text((82, 214), "wren", font=font(30), fill=BROWN, anchor="mm")
    ImageDraw.Draw(mark_img).text((82, 244), "a warm place to browse", font=font(11), fill=SOFT, anchor="mm")
    mark_img.save(os.path.join(BRAND, "wizWatermark.bmp"))

    # the stub installer's backdrop
    back = Image.new("RGBA", (1440, 880), CREAM + (255,))
    back.save(os.path.join(BRAND, "background.png"))

    # the word "wren" for the About dialog and the home page
    for name, fill in (("about-wordmark.svg", "#8a4b2a"), ("firefox-wordmark.svg", "#8a4b2a")):
        with open(os.path.join(CONTENT, name), "w", encoding="utf-8") as f:
            f.write(WORDMARK.format(fill=fill))
    print("wren branding regenerated")


if __name__ == "__main__":
    sys.exit(main())
