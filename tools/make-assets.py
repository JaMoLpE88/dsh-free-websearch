"""Generates the README artwork for dsh-free-websearch.

Explanatory mockups rather than screenshots, because this plugin has no UI of
its own: it changes who serves two tools that already exist. Run:

    python tools/make-assets.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "assets"
OUT.mkdir(exist_ok=True)

SS = 2  # supersample, then downscale for crisp edges

BG = (13, 17, 23)
CARD = (22, 27, 34)
CARD2 = (28, 33, 40)
BORDER = (48, 54, 61)
TEXT = (230, 237, 243)
MUTED = (139, 148, 158)
DIM = (110, 118, 129)
MINT = (63, 185, 80)
BLUE = (88, 166, 255)
AMBER = (210, 153, 34)
CORAL = (248, 81, 73)
PURPLE = (188, 140, 255)

REG = "C:/Windows/Fonts/segoeui.ttf"
SEMI = "C:/Windows/Fonts/seguisb.ttf"
MONO = "C:/Windows/Fonts/consola.ttf"
SYM = "C:/Windows/Fonts/seguisym.ttf"

_cache = {}


def font(path, size):
    key = (path, size)
    if key not in _cache:
        _cache[key] = ImageFont.truetype(path, size * SS)
    return _cache[key]


class Canvas:
    def __init__(self, width, height):
        self.w, self.h = width, height
        self.img = Image.new("RGB", (width * SS, height * SS), BG)
        self.d = ImageDraw.Draw(self.img)

    @staticmethod
    def _p(value):
        return int(round(value * SS))

    def rect(self, x, y, w, h, radius=14, fill=CARD, outline=BORDER, width=1):
        self.d.rounded_rectangle(
            [self._p(x), self._p(y), self._p(x + w), self._p(y + h)],
            radius=self._p(radius),
            fill=fill,
            outline=outline,
            width=self._p(width),
        )

    def text(self, x, y, value, size=18, fill=TEXT, path=REG, anchor="la"):
        self.d.text((self._p(x), self._p(y)), value, font=font(path, size), fill=fill, anchor=anchor)

    def chip(self, x, y, label, size=13, fill=MUTED, border=BORDER, pad=10, bg=None):
        f = font(SEMI, size)
        w = self.d.textlength(label, font=f) / SS
        h = size + 12
        self.rect(x, y, w + pad * 2, h, radius=h / 2, fill=bg or CARD2, outline=border)
        self.text(x + pad, y + h / 2, label, size=size, fill=fill, path=SEMI, anchor="lm")
        return w + pad * 2

    def line(self, x1, y1, x2, y2, fill=BORDER, width=2):
        self.d.line([self._p(x1), self._p(y1), self._p(x2), self._p(y2)], fill=fill, width=self._p(width))

    def arrow(self, x1, y1, x2, y2, fill=BORDER, width=2, head=9):
        self.line(x1, y1, x2, y2, fill=fill, width=width)
        if x2 > x1:
            self.d.polygon(
                [self._p(x2), self._p(y2), self._p(x2 - head), self._p(y2 - head * 0.6), self._p(x2 - head), self._p(y2 + head * 0.6)],
                fill=fill,
            )
        elif y2 > y1:
            self.d.polygon(
                [self._p(x2), self._p(y2), self._p(x2 - head * 0.6), self._p(y2 - head), self._p(x2 + head * 0.6), self._p(y2 - head)],
                fill=fill,
            )

    def wrap(self, x, y, value, width, size=15, fill=MUTED, path=REG, leading=1.45):
        f = font(path, size)
        words, line, lines = value.split(), "", []
        for word in words:
            probe = f"{line} {word}".strip()
            if self.d.textlength(probe, font=f) / SS <= width:
                line = probe
            else:
                lines.append(line)
                line = word
        if line:
            lines.append(line)
        for index, text_line in enumerate(lines):
            self.text(x, y + index * size * leading, text_line, size=size, fill=fill, path=path)

    def save(self, name):
        self.img.resize((self.w, self.h), Image.LANCZOS).save(OUT / name, optimize=True)
        print("wrote", OUT / name)


def header(c, eyebrow, title, subtitle):
    c.text(64, 56, eyebrow, size=13, fill=MUTED, path=SEMI)
    c.text(64, 84, title, size=38, fill=TEXT, path=SEMI)
    if subtitle:
        c.text(64, 140, subtitle, size=18, fill=MUTED)


LANES = [
    ("Keenable", "1,000 / hour", "keyless JSON", MINT),
    ("Firecrawl", "1,000 / month", "keyless JSON", AMBER),
    ("Bing", "unlimited", "RSS", BLUE),
    ("DuckDuckGo", "unlimited", "HTML", BLUE),
    ("You.com", "100 / day", "keyless JSON", PURPLE),
]


def how_it_works():
    c = Canvas(1600, 1010)
    header(
        c,
        "DSH-FREE-WEBSEARCH",
        "Same tools. Free engines.",
        "The harness keeps web_search and web_fetch exactly as they are. Only the backend changes.",
    )

    y = 250
    c.rect(64, y, 320, 140)
    c.text(88, y + 26, "Your model", size=15, fill=DIM, path=SEMI)
    c.text(88, y + 52, "any provider", size=24, path=SEMI)
    c.text(88, y + 92, "OpenCode Go, DeepSeek, …", size=14, fill=MUTED)

    c.arrow(396, y + 70, 448, y + 70)

    c.rect(460, y, 420, 140)
    c.text(484, y + 26, "DSH tools", size=15, fill=DIM, path=SEMI)
    c.text(484, y + 52, "web_search · web_fetch", size=22, path=SEMI)
    c.text(484, y + 92, "same schema, same source cards", size=14, fill=MUTED)

    c.arrow(892, y + 70, 944, y + 70)

    c.rect(956, y, 580, 140, fill=(20, 32, 44), outline=(38, 78, 110))
    c.text(980, y + 26, "ctx.web seam", size=15, fill=(110, 168, 214), path=SEMI)
    c.text(980, y + 52, "one provider per call", size=22, path=SEMI)
    c.text(980, y + 92, "pinned by this bundle · restored on uninstall", size=14, fill=MUTED)

    # fan-out
    seam_x = 1246
    seam_y = y + 140
    c.line(seam_x, seam_y, seam_x, seam_y + 42)
    label_y = seam_y + 42
    c.chip(seam_x + 18, label_y, "free lane chain", size=12, fill=MUTED)

    card_w, gap, cards_y, card_h = 280, 18, label_y + 52, 210
    total = len(LANES) * card_w + (len(LANES) - 1) * gap
    start_x = (1600 - total) / 2
    centers = []

    for index, (lane, quota, kind, color) in enumerate(LANES):
        x = start_x + index * (card_w + gap)
        centers.append(x + card_w / 2)
        c.rect(x, cards_y, card_w, card_h, fill=CARD)
        c.d.rounded_rectangle(
            [Canvas._p(x + 1), Canvas._p(cards_y + 1), Canvas._p(x + card_w - 1), Canvas._p(cards_y + 5)],
            radius=Canvas._p(2),
            fill=color,
        )
        c.text(x + 22, cards_y + 28, lane, size=21, fill=TEXT, path=SEMI)
        c.text(x + 22, cards_y + 68, quota, size=15, fill=color, path=SEMI)
        c.text(x + 22, cards_y + 96, kind, size=13, fill=MUTED)
        c.text(x + 22, cards_y + 138, "no key", size=13, fill=DIM)
        c.text(x + 22, cards_y + 160, "no signup", size=13, fill=DIM)

    # connectors from the seam label to each card top
    for center in centers:
        c.line(seam_x, label_y + 26, seam_x, cards_y - 14)
        c.line(center, cards_y - 14, seam_x, cards_y - 14, fill=BORDER, width=1)
        c.arrow(center, cards_y - 14, center, cards_y - 2, head=7)

    y2 = cards_y + card_h + 30
    c.text(64, y2, "First lane that answers wins.", size=17, fill=TEXT, path=SEMI)
    c.text(64, y2 + 30, "7 s per lane · 30 s per search · 5 min result cache · cooldowns on failure", size=15, fill=MUTED)

    # paid band
    band_y = 880
    c.rect(64, band_y, 1472, 74, radius=12, fill=(32, 18, 20), outline=(120, 50, 48))
    c.text(90, band_y + 37, "✕", size=24, fill=CORAL, path=SYM, anchor="lm")
    c.text(130, band_y + 37, "api.deepseek.com", size=20, fill=CORAL, path=MONO, anchor="lm")
    c.text(430, band_y + 37, "never called — the paid search and fetch providers are disabled by the bundle", size=15, fill=(200, 140, 138), anchor="lm")
    c.save("how-it-works.png")


def failover():
    c = Canvas(1600, 780)
    header(
        c,
        "FAILOVER",
        "One search, one lane",
        "Lanes are tried in order and the first answer stops the chain, so the other quotas stay unspent.",
    )

    def panel(y, title, state, total, rows, accent):
        c.rect(64, y, 1472, 236, fill=CARD)
        c.text(92, y + 26, title, size=20, fill=TEXT, path=SEMI)
        c.text(1484, y + 26, total, size=20, fill=accent, path=SEMI, anchor="ra")
        x = 92
        for lane, quota, kind, color in LANES:
            ok = rows[lane]
            fill = (18, 32, 24) if ok == "hit" else CARD2
            border = MINT if ok == "hit" else ((120, 50, 48) if ok == "fail" else BORDER)
            c.rect(x, y + 78, 270, 112, radius=10, fill=fill, outline=border)
            mark = "✓" if ok == "hit" else ("✕" if ok == "fail" else "·")
            mark_color = MINT if ok == "hit" else (CORAL if ok == "fail" else DIM)
            c.text(x + 18, y + 96, mark, size=16, fill=mark_color, path=SYM)
            c.text(x + 44, y + 96, lane, size=16, fill=TEXT if ok != "idle" else MUTED, path=SEMI)
            if ok == "hit":
                c.text(x + 18, y + 128, "answered", size=13, fill=MINT)
                c.text(x + 18, y + 152, quota, size=12, fill=MUTED)
            elif ok == "fail":
                c.text(x + 18, y + 128, "429 · cooldown 5 min", size=13, fill=CORAL)
                c.text(x + 18, y + 152, "retried after the wall", size=12, fill=MUTED)
            else:
                c.text(x + 18, y + 128, "untouched", size=13, fill=DIM)
                c.text(x + 18, y + 152, "quota kept", size=12, fill=DIM)
            x += 282

    panel(
        210,
        "Keenable answers",
        "",
        "0.23 s",
        {"Keenable": "hit", "Firecrawl": "idle", "Bing": "idle", "DuckDuckGo": "idle", "You.com": "idle"},
        MINT,
    )
    panel(
        486,
        "Keenable's hourly pool is spent",
        "",
        "0.33 s",
        {"Keenable": "fail", "Firecrawl": "hit", "Bing": "idle", "DuckDuckGo": "idle", "You.com": "idle"},
        AMBER,
    )

    c.text(64, 748, "All five fail → one error naming every lane. No sixth step, no paid API.", size=15, fill=MUTED)
    c.save("failover.png")


def coverage():
    c = Canvas(1600, 720)
    header(
        c,
        "CAPACITY",
        "The two unlimited lanes are the floor",
        "Anonymous pools are shared per IP, so the chain leans on the lanes with no published cap.",
    )

    rows = [
        ("Bing", None, "no published cap", BLUE),
        ("DuckDuckGo", None, "no published cap", BLUE),
        ("Keenable", 24000, "1,000 / hour", MINT),
        ("You.com", 100, "100 / day", PURPLE),
        ("Firecrawl", 33, "1,000 / month", AMBER),
    ]
    top, row_h = 250, 62
    bar_x, bar_w = 380, 900
    scale = 24000

    for index, (lane, value, note, color) in enumerate(rows):
        y = top + index * row_h
        c.text(64, y + 14, lane, size=18, fill=TEXT, path=SEMI)
        if value is None:
            c.d.rounded_rectangle(
                [Canvas._p(bar_x), Canvas._p(y + 12), Canvas._p(bar_x + bar_w), Canvas._p(y + 40)],
                radius=Canvas._p(14),
                fill=(20, 30, 40),
                outline=color,
                width=Canvas._p(1),
            )
            c.text(bar_x + bar_w - 18, y + 26, "∞", size=22, fill=color, path=SYM, anchor="rm")
        else:
            width = max(bar_w * (value / scale), 10)
            c.d.rounded_rectangle(
                [Canvas._p(bar_x), Canvas._p(y + 12), Canvas._p(bar_x + width), Canvas._p(y + 40)],
                radius=Canvas._p(14),
                fill=color,
            )
        c.text(bar_x + bar_w + 24, y + 18, note, size=14, fill=MUTED)

    c.text(64, 590, "Bars are requests per day where a daily figure exists; Keenable's hourly cap is shown as 24,000.", size=13, fill=DIM)
    c.text(64, 616, "Firecrawl counts credits, not requests: one search is one credit.", size=13, fill=DIM)
    c.text(64, 660, "≈ 2,500 free searches a day before failover is even needed — and the two unlimited lanes are last, not first.", size=15, fill=TEXT)
    c.save("coverage.png")


def tool_card():
    c = Canvas(1400, 880)
    c.rect(48, 48, 1304, 784, radius=18, fill=CARD)

    c.text(88, 86, "web_search", size=24, fill=TEXT, path=SEMI)
    w = c.chip(250, 86, "freeweb", size=13, fill=MINT, border=(40, 90, 50), bg=(18, 34, 24))
    c.text(250 + w + 14, 96, "8 sources · 0.23 s", size=14, fill=MUTED)
    c.line(88, 136, 1312, 136, fill=BORDER, width=1)

    c.text(88, 158, 'queries: ["DeepSeek Harness plugin market"]', size=14, fill=DIM, path=MONO)

    results = [
        ("GitHub - polang233/dsh-plugin-index", "github.com/polang233/dsh-plugin-index", "Open Plugin Market — community plugin index for DeepSeek Harness, with daily picks."),
        ("DeepSeek Harness Plugin Marketplace", "deepseekharness.dev/plugins", "Official and community plugins, browsable by category."),
        ("awesome-dsh-plugin — curated list", "github.com/Anil-matcha/awesome-dsh-plugin", "A curated guide to the harness and the best community plugins built on it."),
        ("GitHub - dsh-ai-org/top-dsh-plugins", "github.com/dsh-ai-org/top-dsh-plugins", "Daily-updated plugin rankings with stars and growth."),
        ("dsh plugin market — setup guide", "dsh-plugin.org/tutorials", "Install the market once, then install everything else from its page."),
    ]
    y = 200
    for title, url, snippet in results:
        c.text(88, y, title, size=17, fill=(121, 192, 255), path=SEMI)
        c.text(88, y + 26, url, size=12, fill=MUTED, path=MONO)
        c.wrap(88, y + 48, snippet, 1160, size=13, fill=DIM)
        y += 118
        c.line(88, y - 18, 1312, y - 18, fill=(32, 38, 45), width=1)

    c.text(88, 780, "Same citation card the paid provider renders. Nothing to configure, no key in the request.", size=13, fill=DIM)
    c.save("tool-card.png")


if __name__ == "__main__":
    how_it_works()
    failover()
    coverage()
    tool_card()
