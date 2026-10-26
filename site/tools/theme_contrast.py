"""Check that every site theme's text colours pass WCAG contrast, in light and dark mode.

Run from the site folder:  python tools/theme_contrast.py
It reads public/site.css (the Classic theme and the defaults) and public/themes.css (the other themes),
works out each theme's colour tokens the way the browser does, and prints every pair that falls short.
It also checks rules that set both a text colour and a background (buttons, title bars, pills),
in themes.css and toys.css. Exit code 1 means something failed.
"""
import re
import sys
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / "public"

# (text token, background token, minimum ratio). 7 for body text, 4.5 (WCAG AA) for everything else that is text,
# 3 for the nav underline (a non-text mark, WCAG 1.4.11).
TOKEN_PAIRS = [
    ("--ink", "--bg", 7), ("--ink", "--surface", 7),
    ("--muted", "--bg", 4.5), ("--muted", "--surface", 4.5),
    ("--accent", "--bg", 4.5), ("--accent", "--surface", 4.5), ("--accent-ink", "--accent", 4.5),
    ("--head-ink", "--head-bg", 4.5), ("--head-muted", "--head-bg", 4.5), ("--nav-line", "--head-bg", 3), ("--nav-ink", "--nav-line", 4.5),
    ("--ok", "--ok-bg", 4.5), ("--warn", "--warn-bg", 4.5), ("--bad", "--bad-bg", 4.5),
    ("--ok", "--surface", 4.5), ("--warn", "--surface", 4.5), ("--bad", "--surface", 4.5),
]
# Classic keeps the live site's orange (#c9531c, 4.4 on white) on purpose.
CLASSIC_SKIP = {("--accent", "--surface"), ("--accent", "--bg"), ("--accent-ink", "--accent")}


def strip_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def parse(css, media=""):
    """[(media, selector, body)] for every rule, with @media blocks unwrapped one level at a time."""
    rules, i = [], 0
    while (j := css.find("{", i)) >= 0:
        sel, depth, k = css[i:j].strip(), 1, j + 1
        while depth:
            depth += {"{": 1, "}": -1}.get(css[k], 0)
            k += 1
        body = css[j + 1:k - 1]
        if sel.startswith("@media"):
            rules += parse(body, sel)
        elif not sel.startswith("@"):
            rules.append((media, sel, body))
        i = k
    return rules


def declarations(body):
    """{property: value}, splitting on semicolons outside brackets and quotes."""
    out, part, depth, quote = {}, "", 0, None
    for ch in body + ";":
        if quote:
            quote = None if ch == quote else quote
        elif ch in "\"'":
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == ";" and depth == 0:
            if ":" in part:
                name, value = part.split(":", 1)
                out[name.strip()] = value.strip()
            part = ""
            continue
        part += ch
    return out


def is_dark(media):
    return "prefers-color-scheme: dark" in media


# ---------- colours ----------

def rgb(value):
    """(r, g, b) in 0..1 for #rgb, #rrggbb, rgb(...) and color-mix(in srgb, A p%, B); None otherwise."""
    value = value.strip()
    if m := re.fullmatch(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", value):
        h = m.group(1)
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    if m := re.fullmatch(r"rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*[\d.]+%?\s*)?\)", value):
        return tuple(float(x) / 255 for x in m.groups())
    if m := re.fullmatch(r"color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+)\)", value):
        a, b, p = rgb(m.group(1)), rgb(m.group(3)), float(m.group(2)) / 100
        if a and b:
            return tuple(x * p + y * (1 - p) for x, y in zip(a, b))
    named = {"white": "#ffffff", "black": "#000000"}
    return rgb(named[value]) if value in named else None


def luminance(c):
    lin = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def ratio(a, b):
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def resolve(value, tokens, seen=()):
    """Replace var(--x[, fallback]) with the token's value, recursively."""
    def sub(m):
        name, fallback = m.group(1), m.group(2)
        if name in tokens and name not in seen:
            return resolve(tokens[name], tokens, seen + (name,))
        return resolve(fallback, tokens, seen) if fallback else m.group(0)
    prev = None
    while prev != value:
        prev, value = value, re.sub(r"var\((--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)", sub, value)
    return value


def hex_of(c):
    return "#" + "".join(f"{round(x * 255):02x}" for x in c)


# ---------- the check ----------

def main():
    site = parse(strip_comments((PUBLIC / "site.css").read_text()))
    themes = parse(strip_comments((PUBLIC / "themes.css").read_text()))
    toys = parse(strip_comments((PUBLIC / "toys.css").read_text()))

    base = {False: {}, True: {}}
    for media, sel, body in site:
        if sel == ":root":
            for dark in (False, True):
                if not media or (dark and is_dark(media)):
                    base[dark].update({k: v for k, v in declarations(body).items() if k.startswith("--")})

    keys = ["classic"] + list(dict.fromkeys(re.findall(r':root\[data-theme="([\w-]+)"\]\s*$', "\n".join(s for _, s, _ in themes), re.M)))

    def tokens_for(key, dark):
        """Cascade order: site.css light, site.css dark, theme light, theme dark."""
        t = dict(base[False])
        if dark:
            t.update(base[True])
        for want_dark in ((False, True) if dark else (False,)):
            for media, sel, body in themes:
                if sel == f':root[data-theme="{key}"]' and bool(media) == want_dark and (not media or is_dark(media)):
                    t.update({k: v for k, v in declarations(body).items() if k.startswith("--")})
        return t

    failures, checked = [], 0
    for key in keys:
        for dark in (False, True):
            mode = "dark" if dark else "light"
            t = tokens_for(key, dark)
            for fg, bg, need in TOKEN_PAIRS:
                if key == "classic" and (fg, bg) in CLASSIC_SKIP:
                    continue
                a, b = rgb(resolve(t.get(fg, ""), t)), rgb(resolve(t.get(bg, ""), t))
                if not a or not b:
                    failures.append(f"{key:11s} {mode:5s} {fg} on {bg}: can't read a colour")
                    continue
                checked += 1
                if (r := ratio(a, b)) < need:
                    failures.append(f"{key:11s} {mode:5s} {fg} {hex_of(a)} on {bg} {hex_of(b)}: {r:.2f} < {need}")

    # Rules that set their own text colour and background (every colour in a gradient is checked).
    # A rule that uses theme tokens is checked under every theme it can show up in, light and dark.
    def pair_check(rules, source):
        nonlocal checked
        for media, sel, body in rules:
            d = declarations(body)
            bg_value = d.get("background-color") or d.get("background")
            if "color" not in d or not bg_value:
                continue
            m = re.match(r':root\[data-theme="([\w-]+)"\]', sel)
            uses_tokens = "var(" in d["color"] + bg_value
            for key in [m.group(1)] if m else (keys if uses_tokens else ["classic"]):
                for dark in [True] if is_dark(media) else ([False, True] if uses_tokens else [False]):
                    t = tokens_for(key, dark)
                    fg = rgb(resolve(d["color"], t))
                    if not fg:
                        continue
                    for c in re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)", resolve(bg_value, t)):
                        if (b := rgb(c)) and not re.search(r"/\s*\.\d|,\s*0?\.\d+\s*\)", c):  # skip see-through colours
                            checked += 1
                            if (r := ratio(fg, b)) < 4.5:
                                where = f" [{key} {'dark' if dark else 'light'}]" if uses_tokens else (" [dark]" if dark else "")
                                failures.append(f"{source} {sel}{where}: {hex_of(fg)} on {c} = {r:.2f} < 4.5")

    pair_check(themes, "themes.css")
    pair_check(toys, "toys.css")

    print(f"{len(keys)} themes, {checked} colour pairs checked.")
    for f in failures:
        print("  FAIL", f)
    print("All pass." if not failures else f"{len(failures)} failing.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
