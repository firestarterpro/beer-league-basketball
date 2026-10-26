# Writes site/public/themes.css and site/src/lib/themes.ts from palettes.py + the style table below.
# Run from anywhere: python tools/themes/make_themes.py, then check it with python tools/theme_contrast.py.
import sys, urllib.parse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from palettes import T as PAL, OKWB, MIX

SITE = Path(__file__).resolve().parents[2]
NUNITO = 'family=Nunito:wght@400;600;700;800'

def svg(s):  # data URI for a small inline SVG tile
    return "url(\"data:image/svg+xml," + urllib.parse.quote(s, safe="=:/;,'() ") + "\")"

GRIP = svg("<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 -.18'/></filter><rect width='180' height='180' filter='url(#n)'/></svg>")
KRAFT = svg("<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.55 .08' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .35 0 0 0 0 .22 0 0 0 0 .1 0 0 0 .5 -.2'/></filter><rect width='200' height='200' filter='url(#n)'/></svg>")
BRICK_L = svg("<svg xmlns='http://www.w3.org/2000/svg' width='120' height='60'><path d='M0 1h120M0 31h120M1 1v30M61 1v30M31 31v30M91 31v30' fill='none' stroke='#8a3b2a' stroke-opacity='.2' stroke-width='2'/></svg>")
BRICK_D = svg("<svg xmlns='http://www.w3.org/2000/svg' width='120' height='60'><path d='M0 1h120M0 31h120M1 1v30M61 1v30M31 31v30M91 31v30' fill='none' stroke='#000' stroke-opacity='.45' stroke-width='3'/></svg>")
SLIME_L = svg("<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><g fill='#7ad13a' fill-opacity='.16'><path d='M40 50c18-14 44-6 46 12 3 20-18 18-14 34 3 12-12 18-22 8-9-9 2-20-9-26C27 72 24 62 40 50z'/><path d='M190 170c14-10 34-2 32 14-2 13-16 10-14 22 1 9-10 12-16 5-6-7 2-14-6-18-9-5-8-15 4-23z'/><circle cx='150' cy='60' r='7'/><circle cx='80' cy='200' r='5'/><circle cx='226' cy='108' r='4'/></g></svg>")
SLIME_D = svg("<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><g fill='#8be04e' fill-opacity='.10'><path d='M40 50c18-14 44-6 46 12 3 20-18 18-14 34 3 12-12 18-22 8-9-9 2-20-9-26C27 72 24 62 40 50z'/><path d='M190 170c14-10 34-2 32 14-2 13-16 10-14 22 1 9-10 12-16 5-6-7 2-14-6-18-9-5-8-15 4-23z'/><circle cx='150' cy='60' r='7'/><circle cx='80' cy='200' r='5'/><circle cx='226' cy='108' r='4'/></g></svg>")
RINGS = svg("<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><g fill='none' stroke='#d99a55' stroke-opacity='.13'><circle cx='90' cy='100' r='46' stroke-width='5'/><circle cx='90' cy='100' r='40' stroke-width='1.5'/><circle cx='250' cy='250' r='36' stroke-width='4' stroke-dasharray='120 30'/></g></svg>")
STARS = ("radial-gradient(1.5px 1.5px at 20px 30px, rgb(255 255 255 / .7), transparent), "
         "radial-gradient(1px 1px at 120px 80px, rgb(255 255 255 / .6), transparent), "
         "radial-gradient(1.5px 1.5px at 60px 150px, rgb(255 220 120 / .7), transparent), "
         "radial-gradient(1px 1px at 170px 190px, rgb(255 255 255 / .5), transparent)")

# name, emoji, google fonts (css2 query), heading font, body font, h-scale, h-transform, h-style, page-bg L, page-bg D, extra CSS
S = {}
def s(key, name, emoji, fonts, head, body=None, scale=None, transform=None, style=None, pl='', pd='', css='', hpaint='', hpaint_d='', brand=None):
    S[key] = dict(name=name, emoji=emoji, fonts=fonts, head=head, body=body, scale=scale, transform=transform, style=style,
                  pl=pl, pd=pd, css=css, hpaint=hpaint, hpaint_d=hpaint_d, brand=brand)

s('crt', 'CRT Basement', '📺', 'family=VT323', '"VT323", ui-monospace, monospace', scale=1.35,
  pl="repeating-linear-gradient(90deg, rgb(120 78 38 / .12) 0 2px, transparent 2px 118px), "
     "repeating-linear-gradient(90deg, rgb(120 78 38 / .05) 0 1px, transparent 1px 9px), var(--bg)",
  pd="repeating-linear-gradient(90deg, rgb(0 0 0 / .45) 0 3px, transparent 3px 118px), "
     "repeating-linear-gradient(90deg, rgb(255 190 120 / .035) 0 1px, transparent 1px 9px), "
     "linear-gradient(180deg, #2a1d14, var(--bg) 420px)",
  hpaint="repeating-linear-gradient(90deg, rgb(0 0 0 / .18) 0 2px, transparent 2px 64px), var(--head-bg)",
  css="""
{T} h1 { text-shadow: 0 0 10px color-mix(in srgb, var(--accent) 45%, transparent); }
{T} .card { border-radius: 10px; box-shadow: 0 3px 0 rgb(60 35 15 / .18); }
@media (prefers-color-scheme: dark) {
  {T} .card { border-color: #22382c; box-shadow: inset 0 0 40px rgb(60 255 160 / .05), 0 0 0 1px #0b100d; }
  {T} .card h2 { text-shadow: 0 0 8px rgb(120 255 190 / .35); }
}""")

s('commish', 'Commissioner Wall', '📌', 'family=Kalam:wght@700', '"Kalam", "Comic Sans MS", cursive', scale=1.05,
  pl="radial-gradient(rgb(110 70 25 / .32) 1px, transparent 1.6px) 0 0 / 7px 7px, "
     "radial-gradient(rgb(255 245 220 / .45) 1px, transparent 1.6px) 3px 4px / 11px 11px, "
     "radial-gradient(rgb(90 50 15 / .18) 1.5px, transparent 2.2px) 5px 1px / 17px 17px, var(--bg)",
  pd="radial-gradient(rgb(0 0 0 / .45) 1px, transparent 1.6px) 0 0 / 7px 7px, "
     "radial-gradient(rgb(255 220 170 / .08) 1px, transparent 1.6px) 3px 4px / 11px 11px, var(--bg)",
  hpaint="linear-gradient(180deg, rgb(255 255 255 / .06), rgb(0 0 0 / .2)), var(--head-bg)",
  css="""
{T} header { border-bottom: 6px solid #6b4a2b; }
{T} .card { box-shadow: 0 4px 10px rgb(70 40 10 / .28); border-color: #e9dcc4; }
{T} .card::before { content: ""; position: absolute; top: -6px; left: 50%; width: 15px; height: 15px; margin-left: -7px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ff9a8f, #c62828 50%, #6d0f0f); box-shadow: 0 3px 3px rgb(0 0 0 / .35); z-index: 1; pointer-events: none; }
{T} .card:nth-of-type(3n+2)::before { background: radial-gradient(circle at 35% 30%, #9fd0ff, #1d5fbf 50%, #0b2a5c); }
{T} .card:nth-of-type(3n)::before { background: radial-gradient(circle at 35% 30%, #fff1a0, #d9a400 50%, #6b4f00); }
@media (prefers-color-scheme: dark) { {T} .card { border-color: #4a3e30; box-shadow: 0 4px 12px rgb(0 0 0 / .5); } }""")

s('scoreboard', 'Scoreboard', '🚨', 'family=Bebas+Neue', '"Bebas Neue", "Barlow Condensed", sans-serif', scale=1.15,
  pl="repeating-linear-gradient(0deg, rgb(140 90 35 / .10) 0 1px, transparent 1px 24px), "
     "repeating-linear-gradient(90deg, rgb(140 90 35 / .07) 0 1px, transparent 1px 190px), "
     "linear-gradient(90deg, rgb(255 255 255 / .25), transparent 30%, rgb(255 255 255 / .2) 70%, transparent), var(--bg)",
  pd="radial-gradient(rgb(255 210 63 / .09) 1px, transparent 1.7px) 0 0 / 6px 6px, var(--bg)",
  hpaint="radial-gradient(rgb(255 210 63 / .10) 1px, transparent 1.7px) 0 0 / 5px 5px, var(--head-bg)",
  css="""
{T} header nav a[aria-current="page"] { text-shadow: 0 0 8px rgb(255 210 63 / .7); }
{T} h1 { letter-spacing: .04em; }
{T} .card { border-top: 4px solid var(--accent); }""")

s('cartoon', 'Character Board', '🖍️', 'family=Luckiest+Guy&' + NUNITO, '"Luckiest Guy", "Barlow Condensed", sans-serif', body='"Nunito", system-ui, sans-serif',
  pl="radial-gradient(circle at 20% 30%, rgb(123 47 247 / .18) 0 4px, transparent 5px) 0 0 / 96px 96px, "
     "radial-gradient(circle at 70% 60%, rgb(0 179 167 / .2) 0 3px, transparent 4px) 0 0 / 72px 72px, "
     "radial-gradient(circle at 45% 85%, rgb(255 90 0 / .18) 0 3.5px, transparent 4.5px) 0 0 / 120px 120px, "
     "radial-gradient(circle at 85% 15%, rgb(255 205 0 / .35) 0 3px, transparent 4px) 0 0 / 60px 60px, var(--bg)",
  pd="radial-gradient(circle at 20% 30%, rgb(255 225 77 / .16) 0 4px, transparent 5px) 0 0 / 96px 96px, "
     "radial-gradient(circle at 70% 60%, rgb(0 179 167 / .22) 0 3px, transparent 4px) 0 0 / 72px 72px, "
     "radial-gradient(circle at 45% 85%, rgb(255 90 160 / .16) 0 3.5px, transparent 4.5px) 0 0 / 120px 120px, var(--bg)",
  css="""
{T} h1, {T} h2 { letter-spacing: .03em; }
{T} .card { border: 3px solid var(--ink); border-radius: 16px; box-shadow: 5px 5px 0 var(--ink); }
{T} button, {T} .rs-btn, {T} .espn-btn { border-radius: 999px; }
@media (prefers-color-scheme: dark) { {T} .card { border-color: #0d0820; box-shadow: 5px 5px 0 var(--accent); } }""")

s('miami', 'Downtown Miami', '🌴', 'family=Righteous&' + NUNITO, '"Righteous", sans-serif', body='"Nunito", system-ui, sans-serif',
  pl="linear-gradient(180deg, #ffd3a8 0, #ffc0cf 140px, transparent 420px), "
     "repeating-linear-gradient(0deg, transparent 0 22px, rgb(255 122 143 / .08) 22px 24px), var(--bg)",
  pd="linear-gradient(180deg, #3a0d4a 0, transparent 360px), "
     "linear-gradient(rgb(0 229 255 / .10) 1px, transparent 1px) 0 0 / 44px 44px, "
     "linear-gradient(90deg, rgb(255 79 163 / .10) 1px, transparent 1px) 0 0 / 44px 44px, var(--bg)",
  hpaint="linear-gradient(90deg, #ff7a8f, #ffa877 55%, #ffc46b)",
  hpaint_d="linear-gradient(90deg, #12062a, #2b0b45 60%, #12062a)",
  css="""
{T} .card { border-radius: 16px; border-color: #ffd0dc; box-shadow: 0 6px 18px rgb(216 27 114 / .10); }
@media (prefers-color-scheme: dark) {
  {T} header { border-bottom-color: #00e5ff; box-shadow: 0 2px 16px rgb(0 229 255 / .35); }
  {T} .card { border-color: #4a2a6e; box-shadow: 0 0 0 1px rgb(255 79 163 / .15), 0 8px 24px rgb(255 79 163 / .12); }
  {T} h1 { text-shadow: 0 0 12px rgb(255 79 163 / .6); }
}""")

s('xp', 'Windows XP', '🪟', '', '"Trebuchet MS", Tahoma, "Segoe UI", sans-serif', transform='none',
  pl="linear-gradient(180deg, transparent 300px, var(--bg) 520px) 0 0 / 100% 520px no-repeat, "   # the hill fades out instead of ending in a straight line
     "radial-gradient(130% 70% at 25% 112%, #78c850 0 38%, transparent 38.5%) 0 0 / 100% 520px no-repeat, "
     "linear-gradient(180deg, #4a90e2 0, #8cc2f5 220px, var(--bg) 520px) 0 0 / 100% 520px no-repeat, var(--bg)",
  pd="linear-gradient(180deg, #0a2a5e 0, var(--bg) 420px) 0 0 / 100% 420px no-repeat, var(--bg)",
  hpaint="linear-gradient(180deg, #3a7bf0 0, #245edb 10%, #1d4cbf 70%, #1941a5)",
  hpaint_d="linear-gradient(180deg, #1c3a7a 0, #10224d 60%, #0b1838)",
  css="""
{T} header { border-bottom: 3px solid #3c9a3c; }
{T} .card { border: 1px solid #0831d9; border-radius: 8px 8px 4px 4px; box-shadow: 2px 4px 10px rgb(0 0 0 / .22); }
{T} .card > h2:first-child, {T} .card > .sec-head:first-child, {T} .card[data-poll] > .row:first-child {
  margin: -16px -16px 0; padding: 6px 10px; border-radius: 7px 7px 0 0; color: #fff;
  background: linear-gradient(180deg, #0a5fff, #0846d8 55%, #0a3fbd); }
{T} .card > h2:first-child, {T} .card > .sec-head:first-child h2, {T} .card[data-poll] > .row:first-child h3 {
  font: 700 16px/1.3 "Trebuchet MS", Tahoma, sans-serif; text-transform: none; letter-spacing: 0; color: #fff; text-shadow: 1px 1px 0 #0f1f5c; }
{T} .card > .sec-head:first-child .rs-btn { background: #338433; color: #fff; }
{T} button.primary { background: linear-gradient(180deg, #338433, #2b7a2b); border-color: #1d5c1d; color: #fff; }
@media (prefers-color-scheme: dark) {
  {T} .card { border-color: #2a4a9a; }
  {T} .card > h2:first-child, {T} .card > .sec-head:first-child, {T} .card[data-poll] > .row:first-child { background: linear-gradient(180deg, #2a55b8, #1a3a8a 55%, #142e70); }
}""")

s('pokedex', 'Pokédex', '🔴', 'family=Pixelify+Sans:wght@600&' + NUNITO, '"Pixelify Sans", ui-monospace, monospace', body='"Nunito", system-ui, sans-serif',
  pl="linear-gradient(rgb(0 0 0 / .045) 1px, transparent 1px) 0 0 / 24px 24px, "
     "linear-gradient(90deg, rgb(0 0 0 / .045) 1px, transparent 1px) 0 0 / 24px 24px, var(--bg)",
  pd="linear-gradient(rgb(255 255 255 / .04) 1px, transparent 1px) 0 0 / 24px 24px, "
     "linear-gradient(90deg, rgb(255 255 255 / .04) 1px, transparent 1px) 0 0 / 24px 24px, var(--bg)",
  hpaint="radial-gradient(circle at 38px 44px, #c9f0ff 0 5px, #4fb6f0 6px 12px, #1f6fb8 13px 16px, #fff 17px 21px, rgb(0 0 0 / .25) 22px 23px, transparent 24px), var(--head-bg)",
  brand="drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)",
  css="""
{T} .nav-btns { margin-left: 50px; }
{T} header { border-bottom: 6px solid #8e0018; }
{T} .card { border: 2px solid #2a2a2a; border-radius: 12px; box-shadow: inset 0 0 0 3px var(--surface), inset 0 0 0 4px var(--line); }
@media (prefers-color-scheme: dark) { {T} .card { border-color: #000; } }""")

s('blockbuster', 'Blockbuster Night', '📼', 'family=Anton', '"Anton", "Barlow Condensed", sans-serif', style='italic', scale=1.05,
  pl="repeating-linear-gradient(90deg, transparent 0 22px, rgb(11 45 140 / .07) 22px 24px), var(--bg)",
  pd="repeating-linear-gradient(90deg, transparent 0 22px, rgb(255 210 0 / .05) 22px 24px), var(--bg)",
  css="""
{T} h1, {T} h2 { letter-spacing: .02em; }
{T} .card { border-left: 6px solid #ffd200; border-radius: 4px 10px 10px 4px; }
{T} header { border-bottom: 4px solid #ffd200; }""")

s('foodcourt', 'Mall Food Court', '🍕', 'family=Bungee', '"Bungee", "Barlow Condensed", sans-serif', scale=.85,
  pl="radial-gradient(circle at 20% 30%, rgb(255 47 179 / .2) 0 3px, transparent 4px) 0 0 / 90px 90px, "
     "radial-gradient(circle at 70% 60%, rgb(0 190 220 / .24) 0 2.5px, transparent 3.5px) 0 0 / 70px 70px, "
     "radial-gradient(circle at 40% 80%, rgb(255 190 0 / .3) 0 2px, transparent 3px) 0 0 / 50px 50px, "
     "radial-gradient(circle at 85% 15%, rgb(123 47 247 / .18) 0 3px, transparent 4px) 0 0 / 110px 110px, var(--bg)",
  pd="radial-gradient(circle at 20% 30%, rgb(255 47 179 / .25) 0 3px, transparent 4px) 0 0 / 90px 90px, "
     "radial-gradient(circle at 70% 60%, rgb(0 229 255 / .2) 0 2.5px, transparent 3.5px) 0 0 / 70px 70px, "
     "radial-gradient(circle at 40% 80%, rgb(255 210 0 / .18) 0 2px, transparent 3px) 0 0 / 50px 50px, var(--bg)",
  css="""
{T} header { border-top: 5px solid; border-image: linear-gradient(90deg, #ff2fb3, #ffd200, #00e5ff, #7b2ff7) 1; }
{T} .card { border-radius: 14px; border: 2px solid var(--line); box-shadow: 0 4px 0 color-mix(in srgb, var(--accent) 35%, transparent); }""")

s('lisafrank', 'Lisa Frank Neon', '🌈', 'family=Fredoka:wght@700&' + NUNITO, '"Fredoka", "Nunito", sans-serif', body='"Nunito", system-ui, sans-serif',
  pl="radial-gradient(circle at 30% 40%, transparent 0 5px, rgb(42 0 64 / .10) 5px 8px, transparent 8.5px) 0 0 / 64px 64px, "
     "radial-gradient(circle at 70% 75%, transparent 0 3px, rgb(42 0 64 / .08) 3px 6px, transparent 6.5px) 0 0 / 64px 64px, "
     "linear-gradient(135deg, rgb(255 47 179 / .14), rgb(255 242 0 / .14) 35%, rgb(0 229 255 / .14) 65%, rgb(123 47 247 / .14)) fixed, var(--bg)",
  pd="radial-gradient(circle at 30% 40%, transparent 0 5px, rgb(255 95 210 / .12) 5px 8px, transparent 8.5px) 0 0 / 64px 64px, "
     "linear-gradient(135deg, rgb(255 47 179 / .16), rgb(79 210 255 / .12) 50%, rgb(123 47 247 / .18)) fixed, var(--bg)",
  hpaint="linear-gradient(90deg, #ff2fb3, #ff6ad0 50%, #ff2fb3)",
  css="""
{T} .card { border: 3px solid transparent; border-radius: 18px;
  background: linear-gradient(var(--surface), var(--surface)) padding-box, linear-gradient(135deg, #ff2fb3, #ffd200, #00e5ff, #7b2ff7) border-box; }
{T} button.primary { background: linear-gradient(90deg, #c2007d, #7b2ff7); border-color: transparent; }""")

s('aim', 'AIM Buddy List', '🏃', 'family=Comic+Neue:wght@700', '"Comic Neue", "Comic Sans MS", cursive', body='Verdana, Tahoma, sans-serif', transform='none', scale=1.05,
  pl="conic-gradient(rgb(10 61 145 / .06) 25%, transparent 0 50%, rgb(10 61 145 / .06) 0 75%, transparent 0) 0 0 / 32px 32px, var(--bg)",
  pd=STARS + " 0 0 / 210px 210px, var(--bg)",
  hpaint="linear-gradient(180deg, #1a56c4, #0a3d91)",
  css="""
{T} body { font-size: 15px; }
{T} .card { border: 2px solid; border-color: #dfe6f3 #6b7a99 #6b7a99 #dfe6f3; border-radius: 2px; }
{T} .card > h2:first-child, {T} .card > .sec-head:first-child, {T} .card[data-poll] > .row:first-child {
  margin: -16px -16px 0; padding: 4px 8px; background: linear-gradient(90deg, #0a246a, #3a6ea5); color: #fff; }
{T} .card > h2:first-child, {T} .card > .sec-head:first-child h2, {T} .card[data-poll] > .row:first-child h3 {
  font: 700 14px/1.4 Tahoma, Verdana, sans-serif; text-transform: none; letter-spacing: 0; color: #fff; }
{T} button { border-radius: 2px; border: 2px solid; border-color: #fff #6b7a99 #6b7a99 #fff; }
@media (prefers-color-scheme: dark) { {T} .card { border-color: #3a4a86 #0a1230 #0a1230 #3a4a86; } }""")

s('bookfair', 'Book Fair', '📚', 'family=Chewy&' + NUNITO, '"Chewy", "Comic Sans MS", cursive', body='"Nunito", system-ui, sans-serif', transform='none', scale=1.1,
  pl="radial-gradient(circle, rgb(214 0 28 / .16) 0 3px, transparent 3.5px) 0 0 / 46px 46px, "
     "radial-gradient(circle, rgb(0 87 184 / .14) 0 3px, transparent 3.5px) 23px 23px / 46px 46px, var(--bg)",
  pd="radial-gradient(circle, rgb(255 205 0 / .14) 0 3px, transparent 3.5px) 0 0 / 46px 46px, "
     "radial-gradient(circle, rgb(228 0 43 / .16) 0 3px, transparent 3.5px) 23px 23px / 46px 46px, var(--bg)",
  css="""
{T} .card { border-radius: 10px; padding-top: 22px; }
{T} .card::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 7px; border-radius: 9px 9px 0 0; pointer-events: none;
  background: linear-gradient(90deg, #d6001c 0 33.3%, #ffcd00 0 66.6%, #0057b8 0); }
{T} header { border-bottom: 5px solid #ffcd00; }""")

s('skate', 'Skate Shop', '🛹', 'family=Permanent+Marker', '"Permanent Marker", "Comic Sans MS", cursive', transform='none', scale=1.05,
  pl="repeating-linear-gradient(100deg, rgb(120 80 30 / .06) 0 2px, transparent 2px 11px), "
     "repeating-linear-gradient(180deg, transparent 0 140px, rgb(120 80 30 / .10) 140px 142px), var(--bg)",
  pd=GRIP + " 0 0 / 180px 180px, var(--bg)",
  css="""
{T} .card { border: 2px solid var(--ink); border-radius: 4px; box-shadow: 5px 5px 0 var(--accent); }
{T} h1 { transform: rotate(-1.5deg); transform-origin: left; }
{T} header { border-bottom: 4px solid #39ff6a; }""")

s('jacket', 'Starter Jacket', '🧥', 'family=Graduate', '"Graduate", Georgia, serif', scale=.85,
  pl="repeating-linear-gradient(90deg, rgb(16 24 40 / .09) 0 2px, transparent 2px 98px), "
     "linear-gradient(180deg, rgb(255 255 255 / .35), transparent 300px), var(--bg)",
  pd="repeating-linear-gradient(90deg, rgb(0 0 0 / .35) 0 3px, transparent 3px 98px), var(--bg)",
  css="""
{T} header { border-bottom: 0; box-shadow: inset 0 -4px 0 #1d428a, inset 0 -7px 0 #fff, inset 0 -11px 0 #1d428a; padding-bottom: 8px; }
{T} .card { border-radius: 6px; padding-top: 24px; }
{T} .card::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 10px; border-radius: 5px 5px 0 0; pointer-events: none;
  background: linear-gradient(#c8102e 0 4px, #fff 4px 6px, #1d428a 6px 10px); }""")

s('cereal', 'Cereal Box', '🥣', 'family=Titan+One&' + NUNITO, '"Titan One", "Barlow Condensed", sans-serif', body='"Nunito", system-ui, sans-serif',
  pl="radial-gradient(rgb(214 40 40 / .13) 30%, transparent 32%) 0 0 / 14px 14px, var(--bg)",
  pd="radial-gradient(rgb(255 183 3 / .10) 30%, transparent 32%) 0 0 / 14px 14px, var(--bg)",
  brand="drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)",
  css="""
{T} .card { border: 3px solid #1a1a1a; border-radius: 12px; box-shadow: 5px 5px 0 #1a1a1a; }
{T} header { border-bottom: 5px solid #ffd60a; }
@media (prefers-color-scheme: dark) { {T} .card { border-color: #000; box-shadow: 5px 5px 0 #ffb703; } }""")

s('doubledare', 'Double Dare', '🟢', 'family=Lilita+One', '"Lilita One", "Barlow Condensed", sans-serif',
  pl=SLIME_L + " 0 0 / 260px 260px, var(--bg)",
  pd=SLIME_D + " 0 0 / 260px 260px, var(--bg)",
  hpaint="linear-gradient(180deg, #ff8a3d, #ff6a13)",
  hpaint_d="linear-gradient(180deg, #9a3d00, #8a3600)",
  brand="drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)",
  css="""
{T} .card { border: 3px solid #4caf1a; border-radius: 18px; }
{T} header { border-bottom: 6px solid #4caf1a; }""")

s('tamagotchi', 'Tamagotchi', '🥚', 'family=Silkscreen:wght@400;700&' + NUNITO, '"Silkscreen", ui-monospace, monospace', body='"Nunito", system-ui, sans-serif', scale=.9,
  pl="linear-gradient(rgb(15 56 15 / .07) 1px, transparent 1px) 0 0 / 4px 4px, "
     "linear-gradient(90deg, rgb(15 56 15 / .07) 1px, transparent 1px) 0 0 / 4px 4px, var(--bg)",
  pd="linear-gradient(rgb(155 188 15 / .05) 1px, transparent 1px) 0 0 / 4px 4px, "
     "linear-gradient(90deg, rgb(155 188 15 / .05) 1px, transparent 1px) 0 0 / 4px 4px, var(--bg)",
  hpaint="radial-gradient(circle at 12% 120%, rgb(255 255 255 / .35), transparent 50%), var(--head-bg)",
  css="""
{T} .card { border: 3px solid var(--accent); border-radius: 14px; box-shadow: inset 0 2px 6px rgb(15 56 15 / .18); }
{T} header { border-bottom: 4px solid #e58fb0; }""")

s('yearbook', 'Trapper Keeper Yearbook', '📓', 'family=Caveat:wght@700&' + NUNITO, '"Caveat", "Comic Sans MS", cursive', body='"Nunito", system-ui, sans-serif', scale=1.3, transform='none',
  pl="linear-gradient(135deg, rgb(17 181 176 / .10) 25%, transparent 25%) -20px 0 / 40px 40px, "
     "linear-gradient(225deg, rgb(255 46 154 / .10) 25%, transparent 25%) -20px 0 / 40px 40px, "
     "linear-gradient(315deg, rgb(17 181 176 / .10) 25%, transparent 25%) 0 0 / 40px 40px, "
     "linear-gradient(45deg, rgb(255 46 154 / .10) 25%, transparent 25%) 0 0 / 40px 40px, var(--bg)",
  pd="linear-gradient(135deg, rgb(17 181 176 / .12) 25%, transparent 25%) -20px 0 / 40px 40px, "
     "linear-gradient(225deg, rgb(255 46 154 / .12) 25%, transparent 25%) -20px 0 / 40px 40px, "
     "linear-gradient(315deg, rgb(17 181 176 / .12) 25%, transparent 25%) 0 0 / 40px 40px, "
     "linear-gradient(45deg, rgb(255 46 154 / .12) 25%, transparent 25%) 0 0 / 40px 40px, var(--bg)",
  css="""
{T} .card { background: repeating-linear-gradient(180deg, transparent 0 27px, rgb(80 120 200 / .16) 27px 28px), var(--surface);
  box-shadow: inset 7px 0 0 var(--surface), inset 9px 0 0 rgb(255 80 80 / .45); border-radius: 4px; }
{T} h1 { color: #7b2cbf; }
@media (prefers-color-scheme: dark) { {T} h1 { color: #c08cff; } }""")

s('coffee', 'Seattle Coffee', '☕', 'family=Special+Elite', '"Special Elite", "Courier New", monospace', scale=1.05,
  pl=KRAFT + " 0 0 / 200px 200px, var(--bg)",
  pd=RINGS + " 0 0 / 320px 320px, var(--bg)",
  css="""
{T} .card { border-radius: 10px; outline: 2px dashed color-mix(in srgb, var(--accent) 45%, var(--line)); outline-offset: -7px; }
{T} header { border-bottom: 4px solid #2f5d3a; }""")

s('nbc', 'NBA on NBC', '🦚', 'family=Oswald:wght@700', '"Oswald", "Barlow Condensed", sans-serif', style='italic',
  pl="repeating-linear-gradient(0deg, rgb(0 0 0 / .035) 0 1px, transparent 1px 3px), var(--bg)",
  pd="repeating-linear-gradient(0deg, rgb(255 255 255 / .03) 0 1px, transparent 1px 3px), var(--bg)",
  css="""
{T} header { border-bottom: 5px solid; border-image: linear-gradient(90deg, #fccc12 0 16.6%, #f37021 0 33.3%, #cc004c 0 50%, #6460aa 0 66.6%, #0089d0 0 83.3%, #0db14b 0) 1; }
{T} .card { border-top: 4px solid #ffcc00; border-radius: 2px 2px 8px 8px; }""")

s('trash', 'Trash Talk', '🗑️', 'family=Bangers', '"Bangers", "Comic Sans MS", cursive', scale=1.15,
  pl=BRICK_L + " 0 0 / 120px 60px, var(--bg)",
  pd=BRICK_D + " 0 0 / 120px 60px, var(--bg)",
  css="""
{T} h1, {T} h2, {T} h3 { letter-spacing: .04em; }
{T} .card { border: 2px solid var(--ink); border-radius: 6px; box-shadow: 5px 5px 0 #c1121f; }
{T} header { border-bottom: 4px solid #c1121f; }
@media (prefers-color-scheme: dark) { {T} .card { border-color: #000; box-shadow: 5px 5px 0 #ff4d5e; } }""")

# ---- tokens ----
def rgb(h): h = h.lstrip('#'); return [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
def mix(a, b, p):
    A, B = rgb(a), rgb(b); return '#' + ''.join(f'{round((x*p + y*(1-p))*255):02x}' for x, y in zip(A, B))

def _lum(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [v / 12.92 if v <= .03928 else ((v + .055) / 1.055) ** 2.4 for v in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]

def _ratio(a, b):
    x, y = _lum(a), _lum(b)
    return (max(x, y) + .05) / (min(x, y) + .05)

def nav_ink(P):
    """Text on the current page's nav button (filled with the nav line colour): the header colour when it reads, else black or white."""
    if _ratio(P['hb'], P['nl']) >= 4.5: return P['hb']
    return '#000000' if _ratio('#000000', P['nl']) >= _ratio('#ffffff', P['nl']) else '#ffffff'

def tokens(key, P, mode):
    o = dict(OKWB[mode]); o.update({n: P[n] for n in ('ok', 'warn', 'bad') if n in P})
    out = [f"--bg: {P['bg']}; --surface: {P['surface']}; --ink: {P['ink']}; --muted: {P['muted']}; --line: {P['line']};",
           f"--accent: {P['accent']}; --accent-ink: {P['ai']}; --bar: {P['bar']};",
           f"--ok: {o['ok']}; --ok-bg: {mix(o['ok'], P['surface'], MIX)}; --warn: {o['warn']}; --warn-bg: {mix(o['warn'], P['surface'], MIX)};",
           f"--bad: {o['bad']}; --bad-bg: {mix(o['bad'], P['surface'], MIX)};",
           f"--head-bg: {P['hb']}; --head-ink: {P['hi']}; --head-muted: {P['hm']}; --nav-line: {P['nl']}; --nav-ink: {nav_ink(P)};"]
    return out

css = ["/* Site themes. <html data-theme> picks one: Base.astro sets each page's own theme, and the theme bar",
       "   lets each visitor pick a favorite (saved on their device as bl.theme).",
       "   Each theme swaps the colour tokens from site.css (light, plus dark under prefers-color-scheme),",
       "   the heading font (--head), the page background (--page-bg) and the header paint (--head-paint),",
       "   then adds a few touches of its own. Text colours pass WCAG AA in both modes (site/tools/theme_contrast.py).",
       "   Generated by site/tools/themes/make_themes.py from palettes.py: edit those and rerun rather than editing this file.",
       "   Big page backgrounds are the artful part; cards stay plain enough to read. */",
       "",
       ":root[data-theme] .card { position: relative; }",
       ""]
for key, st in S.items():
    L, D = PAL[key]
    t = f':root[data-theme="{key}"]'
    css.append(f"/* ---------- {st['emoji']} {st['name']} ---------- */")
    lines = tokens(key, L, 'L')
    lines.append(f"--head: {st['head']};" + (f" --body: {st['body']};" if st['body'] else '')
                 + (f" --h-scale: {st['scale']};" if st['scale'] else '')
                 + (f" --h-transform: {st['transform']};" if st['transform'] else '')
                 + (f" --h-style: {st['style']};" if st['style'] else ''))
    lines.append(f"--page-bg: {st['pl']};")
    if st['hpaint']: lines.append(f"--head-paint: {st['hpaint']};")
    if st['brand']: lines.append(f"--brand-filter: {st['brand']};")
    lines.append("color-scheme: light;")
    css.append(t + " {\n  " + "\n  ".join(lines) + "\n}")
    dl = tokens(key, D, 'D')
    dl.append(f"--page-bg: {st['pd']};")
    if st['hpaint_d']: dl.append(f"--head-paint: {st['hpaint_d']};")
    elif st['hpaint']:
        # same paint shape, dark header colour underneath (paints that end in var(--head-bg) adapt on their own)
        if not st['hpaint'].rstrip().endswith('var(--head-bg)'): dl.append("--head-paint: var(--head-bg);")
    dl.append("color-scheme: dark;")
    css.append("@media (prefers-color-scheme: dark) {\n  " + t + " {\n    " + "\n    ".join(dl) + "\n  }\n}")
    css.append(st['css'].strip().replace('{T}', t))
    css.append("")

open(f'{SITE}/public/themes.css', 'w').write("\n".join(css))

# ---- registry for Base.astro (theme bar + inline script) ----
CLASSIC = PAL['classic'][0]
reg = []
reg.append(('classic', 'Classic', '🏀', '', CLASSIC['surface'], CLASSIC['accent']))
for key, st in S.items():
    L = PAL[key][0]
    reg.append((key, st['name'], st['emoji'], st['fonts'], L['hb'], L['nl'] if L['accent'] == L['hb'] else L['accent']))
ts = ["// Site themes: the registry behind the theme bar, and each page's own theme.",
      "// Colours and styles live in public/themes.css; this file only names them.",
      "// Generated by tools/themes/make_themes.py (edit it there and rerun).",
      "",
      "export type Theme = { key: string; name: string; emoji: string; fonts: string; swatch: [string, string] };",
      "",
      "// fonts: the Google Fonts css2 query for the theme's heading (and body) font, loaded only when the theme is on.",
      "export const THEMES: Theme[] = ["]
for k, n, e, f, a, b in reg:
    ts.append(f'  {{ key: "{k}", name: "{n}", emoji: "{e}", fonts: "{f}", swatch: ["{a}", "{b}"] }},')
ts += ["];",
       "",
       "// Each page's own theme, from Jason's theme list (2026-10-23). A path ending in / covers every page under it.",
       "// Pages not listed (the LM desk, sign-in, pet desk) use Classic.",
       "export const PAGE_THEME: [path: string, theme: string][] = [",
       '  ["/", "miami"], ["/tiers", "skate"], ["/practice-draft", "bookfair"], ["/rules", "scoreboard"], ["/polls", "lisafrank"],',
       '  ["/approvals", "commish"], ["/actions", "foodcourt"], ["/dashboards", "xp"], ["/player/", "pokedex"], ["/team/", "cartoon"],',
       "];",
       "",
       "export function themeFor(path: string): string {",
       '  const clean = path.length > 1 ? path.replace(/\\/+$/, "") : path;',
       '  const hit = PAGE_THEME.find(([p]) => (p.length > 1 && p.endsWith("/") ? clean.startsWith(p) : clean === p));',
       '  return hit ? hit[1] : "classic";',
       "}",
       "",
       "export const themeName = (key: string) => THEMES.find((t) => t.key === key)?.name ?? \"Classic\";",
       ""]
open(f'{SITE}/src/lib/themes.ts', 'w').write("\n".join(ts))
print('ok', len(S), 'themes')
