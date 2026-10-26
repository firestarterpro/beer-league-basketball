# Beer League Basketball: Image & Sound Pack Spec

What to make for the site, at what size, and where each piece goes. Everything here fits the
current site (`site/`): content column max 1000px, phone first at 390px, existing ids kept
(`#team-picker`, `#sync-now`, `nav a`, `#upcoming`, `article[data-poll]`, `#action-form`,
`#add-search`, `iframe.looker`, `#toast`).

## 0. Rules for every image

| Rule | Value |
|---|---|
| Make it at | **2x** the display size (sizes below are the 2x master) |
| Deliver as | `.webp` (quality 80), plus `.png` for anything with transparency |
| Color | sRGB, no embedded print profile |
| Weight budget | banners ≤ 300 KB, cards/portraits ≤ 120 KB, sprites/icons ≤ 30 KB |
| Folder | `site/public/img/<group>/<name>.webp` (groups below) |
| Names | lowercase-with-dashes, team pieces end in the abv: `card-flag.webp`, `card-lba.webp` |
| Safe zone | keep faces and logos out of the outer **8%** on every edge (rounded corners, phone notches) |

**Keep team names out of the art.** The banners you've made so far bake in "SS - Statistically
Speaking", but that team is now **STAT**. Teams 5 and 6 will get names later, too. Leave a blank
**name plate** in the art (a pizza slice, a VHS label, a TV caption bar) and the site will print
the live name and abv on top. Then a rename never needs a redraw. Each slot below has a
"Plate" row that gives the size of that blank area.

**Characters.** Each "Image space" below is where a '90s/2000s cartoon basketball great goes
(caricature style, like the 4 mascots in banner 2). Since `Public view: NO`, the site is
family-only. If it ever goes public, swap out real NBA logos and TV-show posters (the TMNT
poster in the trash-talk banner).

### The 6 team slots

| Abv | Team | GM | Color (from banner 2) | Mascot so far |
|---|---|---|---|---|
| FLAG | The Cooper Flaggs! | Kenneth | red / white / blue `#d23a2c` `#2a4fa8` | stars-and-stripes caped hero |
| LBA | The Lebroniacs | Michael | purple / gold `#6b3fb3` `#f2b632` | crowned hero |
| STAT | Statistically Speaking | Laura | steel blue `#2f7fb8` | goggles + clipboard hero |
| JST | Jacob's Scary Team | Jacob | ghost green `#7fd08a` | friendly ghost |
| TM5 | Team 5 | (open) | pick: Nick orange `#f47b20` | TBD |
| TM6 | Team 6 | (open) | pick: Lisa Frank pink `#ff3fa4` | TBD |

---

## 1. Banners (one per page)

Make **two crops of every banner**: a wide one for desktop and a 2:1 one for phones. On a phone
the wide one would shrink to about 98px tall and the text gets unreadable.

| File | Master size | Shows at | Use |
|---|---|---|---|
| `banner-<page>-wide.webp` | **3200 × 800** (4:1) | 1000 × 250 | desktop / tablet ≥ 768px |
| `banner-<page>-phone.webp` | **1560 × 780** (2:1) | 390 × 195 | phone |

**Wide safe zone (3200 × 800):** keep the title inside the center **1600 × 360** box (x 800–2400,
y 120–480). Character pods sit left and right of it, between x 260–760 and 2440–2940.
**Phone safe zone (1560 × 780):** title in the top **1400 × 300**; characters in a row below it.

| Page | Theme | Image space |
|---|---|---|
| Home `/` | CRT Basement (banner 2 style) | 6 team mascots across the screen, plates under each (Plate: 360 × 70 each) |
| Polls `/polls` | Lisa Frank Neon | 2–3 legends holding stickers |
| Approvals `/approvals` | Commissioner Wall (photoreal cork board) | a ref-legend with a whistle, pinned polaroids |
| Action requests `/actions` | Mall Food Court + NBA Jam | 2 legends in a 2-on-2 "He's on fire!" pose |
| Dashboards `/dashboards` | Windows XP `fantasy_basketball.exe` | legend as the desktop wallpaper hero |
| League feed (Home section) | Trash Talk (your banner 3) | 2 legends talking smack in AIM bubbles |
| Rules / Settings (new) | VHS + CRT (your settings posters) | none; uses the poster below |
| Standings (later) | Starter Jacket Locker | 6 jackets with blank back plates (Plate: 300 × 80) |
| Power Rankings (later) | Skate Shop grip tape | legends on boards |
| Hall of Fame (later) | Yearbook / Trapper Keeper | yearbook grid, 6 photo frames |

**Home hero (optional, your pizza-box banner):** `hero-home.webp` **2400 × 1350** (16:9), shown
1000 × 563 / 390 × 220. **6 slices**, not 4, each with an empty cheese plate (Plate: 420 × 160)
so the site can print the abv and name.

## 2. Posters (Rules page)

| File | Master | Shows at | Notes |
|---|---|---|---|
| `poster-settings-crt.webp` | **1600 × 2000** (4:5) | 640 × 800 desktop, full width on phone | your "League Settings" TV. Leave the **TV screen as an empty plate** (1100 × 760, top-center) so the site prints the live settings as text. Then rule changes don't need a new image. |
| `poster-settings-board.webp` | **1600 × 2000** (4:5) | same | your cork-board version. Same idea: keep the paper cards blank. |
| VHS team tapes (bottom of poster 1) | 6 spine plates 160 × 360 each | | label area blank, site prints names |

## 3. Team art (the main "image space")

For each of the 6 teams, one character, cut into these sizes:

| File | Master | Shows at | Where |
|---|---|---|---|
| `avatar-<abv>.png` | **512 × 512**, transparent, character centered in a 440px circle | 32–64px | team picker, feed, AIM buddy icon, nav chip |
| `card-<abv>.webp` | **750 × 1050** (2.5:3.5, trading card) | 250 × 350 | Pokémon card flip (#6), card binder (#14). Art window **630 × 470** at top (y 90); stat area below left blank for live W #/M # numbers |
| `card-back.webp` | 750 × 1050 | | one shared card back (league logo) |
| `yearbook-<abv>.webp` | **480 × 600** (4:5), head and shoulders | 120 × 150 | Ranked poll drag (#10), Hall of Fame, locker sign (#21) |
| `jacket-<abv>.webp` | **600 × 700**, transparent | 150 × 175 | Standings lockers |
| `tama-<abv>.png` | 5-frame sprite **640 × 128** (128px frames: idle, happy, eat, sleep, sad) | 32–48px | Sync Now Tamagotchi (#2), rating hearts (#11) |

## 4. Shared-frame pieces (every page)

| # | Piece | File(s) | Master size | Notes |
|---|---|---|---|---|
| 1 | Team picker velcro | `velcro-strip.png` | 512 × 64, tiles left-right | sits behind `#team-picker` |
| 1 | TV static wipe | none | n/a | made in code (canvas noise), no image needed |
| 2 | Sync Now punch card | `punchcard.webp` | 640 × 240 | 10 empty bean circles of 40px at even spacing; site adds punched beans |
| 2 | Coffee bean punch | `bean.png` | 80 × 80 transparent | |
| 2 | Steaming cup (waiting state) | `cup-steam.png` | 4-frame sprite 512 × 128 | |
| 3 | Nav VHS cases | `nav-vhs.png` | **320 × 96** each, 5 of them (home, polls, approvals, actions, dashboards) | spine label blank (Plate 240 × 40); the site prints the word |
| 4 | Slime drips | `slime-1..4.png` | **96 × 240** transparent, top edge flat | fits the 32px gutter at 1x (shown 32–48px wide) |
| 4 | Slime splat | `slime-splat.png` | 240 × 240 | |
| – | Toast frame | `toast-tape.png` | 800 × 120, 9-slice (40px corners) | masking-tape look for `#toast` |
| – | Page background | `bg-<theme>.webp` | **1024 × 1024 tileable** | paneling, cork, carpet; keep it low contrast so text reads |
| – | App icon | `icon-512.png`, `icon-192.png`, `apple-touch-180.png`, `favicon-32.png` | as named | ball + beer foam, no text |
| – | Share card | `og-card.jpg` | **1200 × 630** | what shows when the link is texted |

## 5. Page pieces

**Home `/`**
| # | Piece | Master | Notes |
|---|---|---|---|
| 5 | CRT bezel for Upcoming Games | `crt-bezel.png` **1200 × 900**, transparent screen hole 1000 × 700 at (100, 80) | 9-slice so it stretches |
| 5 | REC dot + scanlines | none | made in code |
| 6 | Battery icon (minutes) | `battery-0..4.png` 96 × 48 | 5 levels |
| 7 | VHS box: Polls / Approvals | `vhs-polls.webp`, `vhs-approvals.webp` **480 × 800** | title area blank (Plate 400 × 120) |
| 7 | "Be kind, rewind" empty sticker | `rewind-sticker.png` 320 × 320 | |
| 8 | VHS jog wheel | `jog-wheel.png` 320 × 320 | rotates in code |

**Polls `/polls`**
| # | Piece | Master | Notes |
|---|---|---|---|
| 9 | Puffy stickers (radio buttons) | `sticker-1..6.png` **192 × 192** | dolphin, rainbow, leopard, star, basketball, heart; plus `sticker-peeled.png` |
| 10 | Locker door | `locker.webp` 480 × 1200 | drop target |
| 11 | Hearts | `heart-empty/half/full.png` 96 × 96 | |
| 12 | Notebook paper | `paper-lines.png` 1024 × 64 tile | dotted lines |
| 12 | Margin doodles | `doodle-1..8.png` 128 × 128 | hearts, balls, stars, lightning |

**Approvals `/approvals`**
| # | Piece | Master | Notes |
|---|---|---|---|
| 13 | Double Dare noses | `nose-yes.png`, `nose-no.png`, plus `-pressed` versions | **320 × 320** each (shown 80px) |
| 13 | Scoreboard | `scoreboard.webp` 1200 × 240 | number slots blank; live "3 Yes · 0 No" printed on top |
| 13 | Stamps | `stamp-approved.png`, `stamp-denied.png` | 600 × 300 transparent, red ink |
| 13 | Ref whistle (auto-Yes) | `whistle.png` 160 × 160 | |
| – | Commissioner wall bg | `bg-cork.webp` 1024 tile | |

**Action requests `/actions`**
| # | Piece | Master | Notes |
|---|---|---|---|
| 14 | Holo tier patches | `tier-t1/t2/t3.png` **128 × 128** | foil shine done in code |
| 15 | Chalkboard | `chalkboard.webp` 1600 × 1000 | PG/SG/SF/PF/C/UTIL/UTIL boxes drawn in chalk, blank inside |
| 16 | Skateboard | `skateboard.png` 480 × 160 | 3-frame ollie sprite 1440 × 160 |
| 16 | Late fee stamp | `latefee.png` 480 × 240 | "LATE FEE" Blockbuster style |
| 17 | Clippy with ball | `clippy.png` 4-frame sprite **1024 × 256** | idle, point, dribble, wave |
| – | Clipboard paper | `clipboard.webp` 1200 × 1600 | behind `#action-form` |

**Dashboards `/dashboards`**
| # | Piece | Master | Notes |
|---|---|---|---|
| 18 | XP window chrome | `xp-window.png` 9-slice, 64px corners | Looker iframe sits inside |
| 18 | Taskbar | `xp-taskbar.png` 1600 × 60 tile | |
| 18 | "Bliss" court wallpaper | `wall-xp-wide.webp` 2560 × 1440, `wall-xp-phone.webp` 1170 × 2532 | |

**Not built yet**
| # | Piece | Master |
|---|---|---|
| 19 | Late-fee LED ticker | `led-digits.png` sprite 11 chars × 64 × 96 |
| 20 | NBA-on-NBC bottom line | none; yellow on black, done in code |
| 21 | Locker interior | `locker-inside.webp` 1200 × 1600, 6 hooks; yearbook sign `sign.png` 600 × 400 |

## 6. Sounds

Muted until the first tap (phone browsers block autoplay); footer toggle to turn them off.

| Rule | Value |
|---|---|
| Format | `.mp3` 128 kbps (plays everywhere), mono, 44.1 kHz |
| Length | ≤ 0.8 s (stingers ≤ 1.5 s), silence trimmed |
| Loudness | peak −1 dB, all clips matched (about −16 LUFS) |
| Size | ≤ 25 KB each |
| Folder | `site/public/sfx/<name>.mp3` |

| Sound | Used by | Sound | Used by |
|---|---|---|---|
| `velcro-rip` | team picker (#1) | `tv-static` | team picker (#1) |
| `punch` | Sync Now (#2) | `tama-chirp` | Sync Now (#2) |
| `shelf-beep` | nav (#3) | `slime-splat` | slime (#4) |
| `channel-click` | upcoming (#5) | `card-flip` | heat ranks (#6), binder (#14) |
| `vhs-slide` | open now (#7) | `aim-door-open` | feed (#8) |
| `sticker-slap` | polls (#9) | `locker-slam` | ranked (#10) |
| `pencil-scratch` | text poll (#12) | `honk` | No vote (#13) |
| `whistle-fweet` | Yes vote (#13) | `buzzer` | denied (#13) |
| `ollie` | IR move (#16) | `clippy-pop` | helper (#17) |
| `xp-ding` | dashboards (#18) | `register-ding` | late fee (#19) |

## 7. Delivery checklist

- [ ] 6 team characters drawn, then cut into avatar / card / yearbook / jacket / tama
- [ ] Home banner wide + phone, team plates blank (TM5 and TM6 included)
- [ ] 5 page banners wide + phone
- [ ] 2 settings posters with blank screens/cards
- [ ] Shared frame pieces (§4)
- [ ] Page pieces for whichever toys get built first (#5, #6, #4 recommended)
- [ ] 20 sounds
- [ ] Drop everything in `site/public/img/...` and `site/public/sfx/...`, then tell Claude to wire it up
