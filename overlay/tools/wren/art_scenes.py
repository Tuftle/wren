"""Wren's pictures: the bird in different scenes, all drawn in one 200 x 200 box.

replace_art.py asks scene_for(file name) which scene suits a picture and places it. A scene is a
function that returns the inside of an svg. Colours: brown bird, amber wing, cream, and a few
soft accents so the set feels like one family.
"""
import zlib

BROWN, AMBER, CREAM = "#8a4b2a", "#e0a870", "#f4efe6"
INK, GREEN, RED, PLUM, SAND = "#5c4a3d", "#7d8f5c", "#c4553a", "#8a6f9a", "#c89b6a"

EYES = {
    "open": '<circle cx="38" cy="54" r="2.6" fill="{eye}"/>',
    "wide": '<circle cx="38" cy="54" r="3.6" fill="{eye}"/><circle cx="39.2" cy="52.8" r="1.1" fill="{hi}"/>',
    "closed": '<path d="M34.5 54.5q3.5 3 7 0" stroke="{eye}" stroke-width="1.9" fill="none" stroke-linecap="round"/>',
    "happy": '<path d="M34.5 55.5q3.5-3.6 7 0" stroke="{eye}" stroke-width="1.9" fill="none" stroke-linecap="round"/>',
    "worried": ('<circle cx="38" cy="54.5" r="2.6" fill="{eye}"/>'
                '<path d="M33.5 49.6l8.4 2.6" stroke="{eye}" stroke-width="1.7" stroke-linecap="round"/>'),
}


def bird(x, y, s=1.4, eye="open", flip=False, body=BROWN, wing=AMBER):
    """The bird with the middle of its body at (x, y); flip makes it face right."""
    sx = -s if flip else s
    tx = x + 59 * s if flip else x - 59 * s
    eyes = EYES[eye].format(eye=CREAM, hi=BROWN) if eye != "closed" and eye != "happy" else EYES[eye].format(eye=CREAM)
    return (f'<g transform="translate({tx:.1f} {y - 64 * s:.1f}) scale({sx:.3f} {s:.3f})">'
            f'<ellipse cx="62" cy="74" rx="28" ry="21" fill="{body}"/><circle cx="42" cy="57" r="14" fill="{body}"/>'
            f'<path d="M84 72C97 68 102 50 99 32c-1-4-7-3-7 1 0 14-6 22-17 27z" fill="{body}"/>'
            f'<path d="M30 54L16 52l13 8z" fill="{body}"/>'
            f'<path d="M54 92v7M68 92v7" stroke="{body}" stroke-width="3.5" stroke-linecap="round"/>'
            f'<path d="M52 70c8-6 22-5 30 4-8 10-26 10-34 1 1-2 2-3 4-5z" fill="{wing}"/>{eyes}</g>')


def star(x, y, r, fill=AMBER):
    return (f'<path d="M{x} {y - r}C{x + r * .15} {y - r * .25} {x + r * .25} {y - r * .15} {x + r} {y}'
            f'C{x + r * .25} {y + r * .15} {x + r * .15} {y + r * .25} {x} {y + r}'
            f'C{x - r * .15} {y + r * .25} {x - r * .25} {y + r * .15} {x - r} {y}'
            f'C{x - r * .25} {y - r * .15} {x - r * .15} {y - r * .25} {x} {y - r}z" fill="{fill}"/>')


def heart(x, y, s, fill=RED):
    return (f'<path transform="translate({x} {y}) scale({s})" d="M0 14C-14 5-22-2-22-12c0-8 6-13 12-13 4 0 8 3 10 6 2-3 6-6 10-6 6 0 12 5 12 13 0 10-8 17-22 26z" fill="{fill}"/>')


def badge(x, y, r, fill, inner):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>{inner}'


def tick(x, y, k):
    return (f'<path d="M{x - 9 * k} {y + 1 * k}l{6 * k} {6 * k} {12 * k}-{13 * k}" fill="none" stroke="{CREAM}" '
            f'stroke-width="{4.5 * k}" stroke-linecap="round" stroke-linejoin="round"/>')


def padlock(x, y, k=1.0):
    return (f'<g transform="translate({x} {y}) scale({k})"><path d="M8 20v-9a10 10 0 0 1 20 0v9" fill="none" stroke="{INK}" '
            f'stroke-width="5" stroke-linecap="round"/><rect x="0" y="18" width="36" height="30" rx="7" fill="{INK}"/>'
            f'<circle cx="18" cy="31" r="4" fill="{CREAM}"/><path d="M18 33v8" stroke="{CREAM}" stroke-width="3" stroke-linecap="round"/></g>')


def shield(x, y, k=1.0, fill=PLUM):
    return (f'<g transform="translate({x} {y}) scale({k})"><path d="M20 0l20 8v17c0 14-9 23-20 29C9 48 0 39 0 25V8z" fill="{fill}"/>'
            f'{tick(20, 26, 1.0)}</g>')


def laptop(x, y, k=1.0):
    return (f'<g transform="translate({x} {y}) scale({k})"><rect x="0" y="0" width="76" height="48" rx="5" fill="{INK}"/>'
            f'<rect x="5" y="5" width="66" height="38" rx="2" fill="{CREAM}"/><path d="M12 14h30M12 21h46M12 28h22" stroke="{SAND}" '
            f'stroke-width="3" stroke-linecap="round"/><path d="M-8 52h92" stroke="{INK}" stroke-width="5" stroke-linecap="round"/></g>')


def phone(x, y, k=1.0):
    return (f'<g transform="translate({x} {y}) scale({k})"><rect x="0" y="0" width="30" height="54" rx="7" fill="{INK}"/>'
            f'<rect x="4" y="6" width="22" height="38" rx="3" fill="{CREAM}"/><circle cx="15" cy="49" r="2" fill="{CREAM}"/>'
            f'{heart(15, 22, .5, AMBER)}</g>')


def puzzle(x, y, k=1.0, fill=PLUM):
    return (f'<g transform="translate({x} {y}) scale({k})" fill="{fill}"><rect x="0" y="8" width="36" height="36" rx="5"/>'
            f'<circle cx="18" cy="6" r="8"/><circle cx="38" cy="26" r="8"/></g>')


def cloud(x, y, k=1.0, fill=CREAM):
    return (f'<g transform="translate({x} {y}) scale({k})" fill="{fill}" fill-opacity=".9"><circle cx="20" cy="26" r="16"/>'
            f'<circle cx="42" cy="16" r="20"/><circle cx="66" cy="27" r="15"/><rect x="14" y="26" width="58" height="16" rx="8"/></g>')


def sparkle_set():
    return star(46, 52, 12) + star(160, 40, 9, PLUM) + star(168, 92, 6) + star(32, 98, 5, GREEN)


def confetti():
    bits, colours = [], [RED, AMBER, GREEN, PLUM, SAND]
    for i in range(22):
        x = 10 + (zlib.crc32(f"x{i}".encode()) % 180)
        y = 6 + (zlib.crc32(f"y{i}".encode()) % 80)
        r = zlib.crc32(f"r{i}".encode()) % 180
        c = colours[i % len(colours)]
        bits.append(f'<rect x="{x}" y="{y}" width="7" height="12" rx="2" fill="{c}" transform="rotate({r} {x} {y})"/>' if i % 3
                    else f'<circle cx="{x}" cy="{y}" r="4" fill="{c}"/>')
    return "".join(bits)


# --- the scenes -----------------------------------------------------------------------------------

def s_plain():
    return bird(100, 108, 1.5)


def s_sparkle():
    return bird(100, 112, 1.4, "wide") + sparkle_set()


def s_check():
    return bird(92, 114, 1.4, "happy") + badge(152, 62, 26, GREEN, tick(152, 62, 1.2))


def s_heart():
    return bird(96, 116, 1.4, "happy") + heart(150, 62, 1.1)


def s_confetti():
    return confetti() + bird(100, 124, 1.4, "happy")


def s_peek():
    return (bird(100, 118, 1.7, "wide") +
            f'<path d="M0 200V150c24-16 52-18 100-14 50-4 78-2 100 14v50z" fill="{INK}"/>'
            f'<path d="M20 160q10-14 20 0M150 154q10-14 20 0" fill="none" stroke="{GREEN}" stroke-width="4" stroke-linecap="round"/>')


def s_meditate():
    return (f'<ellipse cx="100" cy="162" rx="58" ry="14" fill="{PLUM}" fill-opacity=".55"/>'
            + bird(100, 112, 1.4, "closed") + star(46, 56, 9) + star(158, 46, 11, PLUM) + star(166, 104, 6, GREEN)
            + f'<path d="M36 100q-14 6-8 22 14-4 8-22zM168 130q12 2 10 18-14-4-10-18z" fill="{GREEN}"/>')


def s_lookup():
    return (bird(106, 124, 1.4, "wide") + star(38, 36, 11) + star(70, 22, 6, PLUM) + star(24, 70, 6, GREEN)
            + f'<path d="M44 52q-4 14 8 24" fill="none" stroke="{AMBER}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 8"/>')


def s_worried():
    return (bird(96, 118, 1.4, "worried") +
            badge(152, 56, 24, RED, f'<path d="M152 44v16" stroke="{CREAM}" stroke-width="5" stroke-linecap="round"/>'
                                   f'<circle cx="152" cy="69" r="3" fill="{CREAM}"/>'))


def s_sleep():
    return (bird(100, 120, 1.4, "closed") +
            f'<g fill="{PLUM}" font-family="Georgia, serif" font-weight="700"><text x="138" y="62" font-size="30">z</text>'
            f'<text x="158" y="42" font-size="22">z</text><text x="172" y="26" font-size="15">z</text></g>')


def s_unplugged():
    return (bird(100, 94, 1.3, "worried") +
            f'<path d="M20 176h46" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>'
            f'<rect x="66" y="162" width="26" height="28" rx="6" fill="{INK}"/><path d="M96 170h6M96 182h6" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>'
            f'<path d="M180 176h-46" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>'
            f'<rect x="108" y="162" width="26" height="28" rx="6" fill="{PLUM}"/>'
            f'<path d="M120 150l-6 9 8 4-6 9" fill="none" stroke="{AMBER}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>')


def s_lock():
    return bird(80, 116, 1.4, "open") + padlock(138, 76, 1.2)


def s_shield():
    return bird(82, 118, 1.4, "open") + shield(136, 62, 1.5)


def s_devices():
    return laptop(20, 118, 1.0) + bird(112, 94, 1.15, "open", flip=False) + phone(150, 106, 1.05)


def s_puzzle():
    return bird(96, 118, 1.4, "open") + puzzle(138, 82, 1.3) + puzzle(36, 40, .6, SAND) + puzzle(160, 34, .5, GREEN)


def s_paint():
    return (bird(94, 118, 1.4, "open") +
            f'<g transform="rotate(35 150 70)"><rect x="144" y="30" width="12" height="62" rx="5" fill="{SAND}"/>'
            f'<path d="M142 92h16l-3 22h-10z" fill="{INK}"/><path d="M146 114h8l-4 22z" fill="{RED}"/></g>'
            f'<circle cx="54" cy="46" r="7" fill="{RED}"/><circle cx="76" cy="34" r="6" fill="{GREEN}"/><circle cx="40" cy="70" r="5" fill="{PLUM}"/>')


def s_box():
    return (bird(100, 96, 1.3, "wide") +
            f'<path d="M50 118h100l10 62H40z" fill="{SAND}"/><path d="M40 118h120" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>'
            f'<path d="M84 130h32" stroke="{INK}" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>')


def s_cloud():
    return cloud(24, 96, 2.0) + bird(100, 82, 1.2, "happy")


def s_profiles():
    def dot(x, y, fill):
        return f'<circle cx="{x}" cy="{y}" r="20" fill="{fill}"/><circle cx="{x}" cy="{y - 4}" r="6" fill="{CREAM}"/><path d="M{x - 10} {y + 12}q10-12 20 0" fill="{CREAM}"/>'
    return dot(38, 52, GREEN) + dot(166, 44, PLUM) + dot(170, 150, SAND) + bird(98, 118, 1.3, "open")


def s_chart():
    return (f'<path d="M14 176l44-24 34 14 40-50 54-34" fill="none" stroke="{GREEN}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
            + bird(122, 82, 1.1, "happy", flip=True))


def s_clock():
    return (bird(88, 118, 1.4, "open") +
            f'<circle cx="150" cy="62" r="26" fill="{CREAM}" stroke="{INK}" stroke-width="5"/>'
            f'<path d="M150 46v17l12 8" fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>')


def s_globe():
    return (bird(82, 118, 1.35, "open") +
            f'<circle cx="150" cy="70" r="28" fill="{PLUM}"/><path d="M122 70h56M150 42c-16 16-16 40 0 56M150 42c16 16 16 40 0 56" fill="none" stroke="{CREAM}" stroke-width="3"/>')


def s_move():
    return (bird(94, 122, 1.35, "open") +
            f'<rect x="132" y="104" width="46" height="46" rx="6" fill="{SAND}"/><path d="M132 120h46" stroke="{INK}" stroke-width="4"/>'
            f'<path d="M30 60q40-34 84-16" fill="none" stroke="{AMBER}" stroke-width="5" stroke-linecap="round"/>'
            f'<path d="M104 28l14 14-18 8" fill="none" stroke="{AMBER}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>')


def s_avatar():
    return (f'<circle cx="100" cy="100" r="92" fill="{CREAM}" fill-opacity=".75"/>'
            + bird(100, 112, 1.5, "open"))


def s_flower():
    return (bird(96, 114, 1.4, "happy") +
            f'<path d="M158 172v-42" stroke="{GREEN}" stroke-width="5" stroke-linecap="round"/>'
            + "".join(f'<circle cx="{158 + dx}" cy="{122 + dy}" r="9" fill="{c}"/>' for dx, dy, c in
                      [(0, -12, AMBER), (11, -4, AMBER), (7, 10, AMBER), (-7, 10, AMBER), (-11, -4, AMBER)])
            + f'<circle cx="158" cy="122" r="7" fill="{RED}"/>')


SCENES = {
    "plain": s_plain, "sparkle": s_sparkle, "check": s_check, "heart": s_heart, "confetti": s_confetti,
    "peek": s_peek, "meditate": s_meditate, "lookup": s_lookup, "worried": s_worried, "sleep": s_sleep,
    "unplugged": s_unplugged, "lock": s_lock, "shield": s_shield, "devices": s_devices, "puzzle": s_puzzle,
    "paint": s_paint, "box": s_box, "cloud": s_cloud, "profiles": s_profiles, "chart": s_chart,
    "clock": s_clock, "globe": s_globe, "move": s_move, "avatar": s_avatar, "flower": s_flower,
}

# the first keyword found in a picture's file name picks its scene
RULES = [
    ("no-connection", "unplugged"), ("malformed", "unplugged"),
    ("security-error", "lock"), ("holding-lock", "lock"), ("locked", "lock"), ("lock", "lock"),
    ("concerned", "worried"), ("concern", "worried"), ("sympathetic", "worried"), ("error", "worried"),
    ("warning", "worried"),
    ("confetti", "confetti"), ("champion", "confetti"), ("happy", "confetti"), ("gratitude", "flower"),
    ("checkmark", "check"), ("check", "check"),
    ("heart", "heart"),
    ("meditat", "meditate"),
    ("peek", "peek"),
    ("sit-look-up", "lookup"), ("look-up", "lookup"),
    ("addons", "puzzle"), ("extension", "puzzle"), ("puzzle", "puzzle"),
    ("history", "clock"), ("tab-groups", "box"), ("pbw", "meditate"),
    ("empty", "sleep"),
    ("profiles", "profiles"),
    ("stocks", "chart"), ("watchlist", "chart"),
    ("page-history", "clock"), ("history", "clock"),
    ("vpn", "globe"), ("ipprotection", "globe"),
    ("privacy", "shield"), ("trustpanel-graphic-enabled", "shield"), ("trustpanel", "shield"), ("shield", "shield"),
    ("themes", "paint"), ("paint", "paint"), ("wallpaper", "paint"),
    ("qr", "devices"), ("devices", "devices"), ("tabs", "devices"), ("sync", "devices"), ("mobile", "devices"),
    ("pickup", "devices"),
    ("cloud", "cloud"), ("backup", "box"), ("box", "box"),
    ("migration", "move"), ("import", "move"),
    ("signed-out", "avatar"), ("avatar", "avatar"), ("in-circle", "avatar"), ("circle", "avatar"),
    ("smart-window", "sparkle"), ("default", "heart"), ("agent", "sparkle"),
    ("widget", "sparkle"), ("cta", "sparkle"), ("survey", "sparkle"), ("settings-preview", "plain"),
]
FALLBACK = ["plain", "sparkle", "flower", "lookup", "heart", "sleep"]


def scene_for(name):
    low = name.lower()
    for key, scene in RULES:
        if key in low:
            return scene
    return FALLBACK[zlib.crc32(low.encode()) % len(FALLBACK)]


def render(name):
    """The inside of a 200 x 200 picture for this file name."""
    return SCENES[scene_for(name)]()
