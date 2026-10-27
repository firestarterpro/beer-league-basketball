# Player Cartoon Portraits (`public/img/players/`)

Cartoon pixel-art portraits for top NBA players, designed to sit alongside the 7 live team avatars in `public/img/teams/avatar-*.webp`.

## File & Manifest Conventions

- **Image filename:** `portrait-<nba_person_id>.webp` (e.g. `portrait-1641705.webp`).
- **Format & dimensions:** `512x512` RGBA WebP with a transparent background, under `80 KB` per file.
- **Manifest (`portraits.json`):** JSON array with one object per portrait:
  ```json
  {
    "nba_person_id": 1641705,
    "player": "Victor Wembanyama",
    "team": "SAS",
    "added": "YYYY-MM-DD",
    "source": "2025-26 weekly_nba + weekly_fantasy top 25",
    "active": true
  }
  ```
- **Retention & Cadence Policy:**
  - New portraits are added at each **4-week tier refresh** (not weekly) for any player newly entering the top 25 who does not already have a portrait.
  - **Never remove portraits.** Players who drop out of the top 25 keep their `portrait-<id>.webp` file and their entry in `portraits.json`, with `"active": true`.

## Style Guide (Matching `public/img/teams/avatar-*.webp`)

1. **Art Style:** Retro 16-bit chibi pixel-art full-body basketball sprite with bold black pixelated outlines, crisp stepped pixel edges, and vibrant cel/pixel shading.
2. **Style & Likeness References:**
   - Pass two team avatars as style anchors:
     - `public/img/teams/avatar-cct.webp` (real-athlete facial likeness, beard/hair detailing, and shading in 16-bit chibi pixel art)
     - `public/img/teams/avatar-lba.webp` (chibi basketball proportions, outline weight, and stance)
   - Pass the player's official NBA.com headshot (`https://cdn.nba.com/headshots/nba/latest/260x190/<nba_person_id>.png`) as the third reference image so skin tone, hairstyle, facial hair, headbands, and facial expression match the real player.
3. **Uniform & Pose:**
   - Use the player's **colored team uniform** (Icon/Statement/City colored jersey and shorts, avoiding plain white jerseys so interior highlights never blend into the white generation backdrop) with the team wordmark and jersey number clearly visible on the chest.
   - Full-body standing pose holding a basketball tucked under one arm, with the other arm hanging naturally or making an open gesture (avoid capes and avoid closed arm-on-hip loops that trap white background pockets).
   - Generate on a solid pure white (`#FFFFFF`) background.

## Post-Processing Steps (1024x1024 Raw -> 512x512 Transparent WebP)

Using Node.js and `sharp` (available in `site/node_modules`):
1. Load the raw 1:1 image with `.ensureAlpha().raw()`.
2. Flood-fill from all 4 canvas edges through near-white background pixels (`min(R,G,B) >= 230` and `max(R,G,B) - min(R,G,B) <= 25`), setting `alpha = 0` (also clear any enclosed pure-white arm-torso background pocket if present).
3. Run 2 passes along the transparent boundary to strip 1–2 px JPEG anti-alias gray halos (`min(R,G,B) >= 180` and `max - min <= 35` adjacent to transparent pixels) so the bold black pixel outline sits cleanly over both light and dark UI themes.
4. Resize to `512x512` (`kernel: "lanczos3"`) and encode as WebP (`.webp({ quality: 90, alphaQuality: 100 })`), verifying dimensions (`512x512`), 4-channel RGBA transparency, and file size (`< 80 KB`).
