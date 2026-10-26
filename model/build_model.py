"""Power-ranking model for the draft-day tiers. Copy of beer-league-sample/build_model.py (steps 1-7 unchanged).

Window (from pull_draft.py): each team's 2026-27 preseason games first (newest), then 2025-26 regular-season
games, skipping each team's last 5 regular-season games; play-in and playoffs never included. 20 games per team.
Preseason games without hustle / defensive / tracking box scores still count: they are scored on boosted
Game Score, and their missing defense stats are left out of the defense averages (as the sample already did
for any missing source). Reads model/data/, writes the 4 ranking CSVs to model/out_draft/.
"""
import os
import re
import sys
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
IN = HERE / "data"
OUT = HERE / "out_draft"
OUT.mkdir(exist_ok=True)
# Minutes Power: a block counts only with this many qualifying minutes (default 30; 0 = no minimum).
# With a minimum, Minutes outputs get a suffix (e.g. _min30).
BLOCK_MIN = float(os.environ.get("BLOCK_MIN_MINUTES", 30))
SUFFIX = f"_min{BLOCK_MIN:g}" if BLOCK_MIN else ""
ID = {"GAME_ID": str, "gameId": str}
BLOCK_W = {1: 21, 2: 20, 3: 19, 4: 18}
STATS = ["PTS", "FGM", "FGA", "FTM", "FTA", "3PM", "3PA", "OREB", "DREB", "AST", "STL", "BLK", "TOV", "PF"]
BOX_COLS = {"points": "PTS", "fieldGoalsMade": "FGM", "fieldGoalsAttempted": "FGA", "freeThrowsMade": "FTM",
            "freeThrowsAttempted": "FTA", "threePointersMade": "3PM", "threePointersAttempted": "3PA",
            "reboundsOffensive": "OREB", "reboundsDefensive": "DREB", "assists": "AST", "steals": "STL",
            "blocks": "BLK", "turnovers": "TOV", "foulsPersonal": "PF"}
DEF = ["contestedShots", "defensiveBoxOuts", "looseBallsRecoveredTotal", "deflections", "chargesDrawn",
       "fgSaved", "rimSaved"]
TECH_EXCLUDED = {"Technical", "Double Technical", "Delay Technical", "Hanging Technical",
                 "Excess Timeout Technical", "Defense 3 Second"}
notes = []


def read(name):
    return pd.read_csv(IN / name, dtype=ID, low_memory=False)


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def parse_min(m):
    if pd.isna(m) or not str(m).strip():
        return 0.0
    mm, ss = str(m).split(":")
    return int(mm) + int(ss) / 60


def margin_mult(m):
    return 1.05 if m <= 3 else 1.03 if m <= 6 else 1.01 if m <= 9 else 1.00


# ---------- STEP 1: games, blocks, slots ----------
sel = read("selected_team_games.csv")
sel["block"] = np.ceil(sel.RECENCY_RANK / 5).astype(int)
sel["slot_w"] = 10 - (sel.RECENCY_RANK - 1) % 5
sel["block_w"] = sel.block.map(BLOCK_W)

trad = read("boxscoretraditionalv3_PlayerStats.csv")
pg = trad.merge(sel[["GAME_ID", "TEAM_ID", "TEAM_ABBREVIATION", "GAME_DATE", "WL", "SEASON_TYPE", "RECENCY_RANK",
                     "block", "slot_w", "block_w"]],
                left_on=["GAME_ID", "teamId"], right_on=["GAME_ID", "TEAM_ID"], how="inner")
pg = pg.rename(columns=BOX_COLS)
pg["MIN"] = pg.minutes.map(parse_min)
pg["qual"] = pg.MIN >= 6.0
pg["player"] = pg.firstName.fillna("") + " " + pg.familyName.fillna("")
pg["REB"] = pg.OREB + pg.DREB
for c in STATS:
    pg[c] = pg[c].fillna(0)

# ---------- STEP 2: close-game boost ----------
pbp = read("playbyplayv3_PlayByPlay.csv").sort_values(["GAME_ID", "actionNumber"])
for c in ["scoreHome", "scoreAway"]:
    pbp[c] = pd.to_numeric(pbp[c], errors="coerce")
    after = pbp.groupby("GAME_ID")[c].ffill().fillna(0)
    pbp[c + "_before"] = after.groupby(pbp.GAME_ID).shift(1).fillna(0)
pbp["mult"] = (pbp.scoreHome_before - pbp.scoreAway_before).abs().map(margin_mult)
pbp["desc"] = pbp.description.fillna("")

# name -> personId lookup per (game, team), from box rows and the players' own PBP rows
names = []
for _, r in trad.iterrows():
    for n in (r.familyName, r.nameI, f"{r.firstName} {r.familyName}"):
        names.append((r.GAME_ID, r.teamId, norm(n), r.personId))
own = pbp[pbp.personId > 0][["GAME_ID", "teamId", "playerName", "playerNameI", "personId"]].drop_duplicates()
for _, r in own.iterrows():
    for n in (r.playerName, r.playerNameI):
        if pd.notna(n):
            names.append((r.GAME_ID, r.teamId, norm(n), r.personId))
nm = pd.DataFrame(names, columns=["GAME_ID", "teamId", "name", "personId"]).drop_duplicates()
in_box = set(zip(trad.GAME_ID, trad.personId))
by_team = nm.groupby(["GAME_ID", "teamId", "name"]).personId.agg(lambda s: set(s)).to_dict()
by_game = nm.groupby(["GAME_ID", "name"]).personId.agg(lambda s: set(s)).to_dict()
unmatched = {}


def lookup(gid, name, team=None, kind=""):
    cands = by_team.get((gid, team, norm(name))) if team is not None else by_game.get((gid, norm(name)))
    cands = {c for c in (cands or set()) if (gid, c) in in_box}
    if len(cands) == 1:
        return next(iter(cands))
    # fallback: "Jal. Williams" = first-name prefix + family name; "Hansen" = unique first name
    scope = trad[(trad.GAME_ID == gid) & ((trad.teamId == team) if team is not None else True)]
    m = re.match(r"^(\w+)\. (.+)$", norm(name))
    if m:
        hit = scope[(scope.familyName.map(norm) == m.group(2)) & scope.firstName.map(norm).str.startswith(m.group(1))]
    else:
        hit = scope[scope.firstName.map(norm) == norm(name)]
    if len(hit) == 1:
        return hit.personId.iloc[0]
    unmatched.setdefault(kind, []).append((gid, name, len(cands)))
    return None


ev = []  # (GAME_ID, personId, stat, weight, mult)


def add(df, stat, weight=1):
    w = df[weight] if isinstance(weight, str) else weight
    ev.append(pd.DataFrame({"GAME_ID": df.GAME_ID, "personId": df.personId, "stat": stat, "w": w, "mult": df.mult}))


made = pbp[pbp.actionType == "Made Shot"]
missed = pbp[pbp.actionType == "Missed Shot"]
ft = pbp[pbp.actionType == "Free Throw"]
ftm = ft[~ft.desc.str.startswith("MISS")]
add(made, "PTS", "shotValue")
add(ftm, "PTS", 1)
add(made, "FGM")
add(pd.concat([made, missed]), "FGA")
add(made[made.shotValue == 3], "3PM")
add(pd.concat([made, missed]).query("shotValue == 3"), "3PA")
add(ftm, "FTM")
add(ft, "FTA")

reb = pbp[(pbp.actionType == "Rebound")].copy()
cnt = reb.desc.str.extract(r"\(Off:(\d+) Def:(\d+)\)").astype(float)
reb["off"], reb["def"] = cnt[0], cnt[1]
reb = reb.dropna(subset=["off"])
reb["d_off"] = reb.off - reb.groupby(["GAME_ID", "personId"]).off.shift(1).fillna(0)
reb["d_def"] = reb["def"] - reb.groupby(["GAME_ID", "personId"])["def"].shift(1).fillna(0)
add(reb[reb.d_off > 0], "OREB")
add(reb[reb.d_def > 0], "DREB")

ast = made[made.desc.str.contains(r" AST\)")].copy()
ast["aname"] = ast.desc.str.extract(r"\(([^()]+?) \d+ AST\)")[0]
ast["personId"] = [lookup(g, n, t, "AST") for g, n, t in zip(ast.GAME_ID, ast.aname, ast.teamId)]
add(ast.dropna(subset=["personId"]), "AST")

add(pbp[pbp.desc.str.contains(r"STEAL \(\d+ STL\)")], "STL")
add(pbp[pbp.desc.str.contains(r"BLOCK \(\d+ BLK\)")], "BLK")
add(pbp[pbp.actionType == "Turnover"], "TOV")

fouls = pbp[(pbp.actionType == "Foul") & ~pbp.subType.isin(TECH_EXCLUDED)]
dbl = fouls[fouls.subType == "Double Personal"]
add(fouls[fouls.subType != "Double Personal"], "PF")
rows = []
for _, r in dbl.iterrows():
    for n in re.findall(r"([^,\-]+?) \(\d+ PF\)", r.desc):
        pid = lookup(r.GAME_ID, n.strip(), None, "PF double personal")
        if pid is not None:
            rows.append({"GAME_ID": r.GAME_ID, "personId": pid, "mult": r.mult})
if rows:
    add(pd.DataFrame(rows), "PF")

ev = pd.concat(ev, ignore_index=True)
ev = ev[[(g, p) in in_box for g, p in zip(ev.GAME_ID, ev.personId)]]  # drop team/coach rows
ev["wm"] = ev.w * ev.mult
agg = ev.groupby(["GAME_ID", "personId", "stat"]).agg(w=("w", "sum"), wm=("wm", "sum")).reset_index()
agg["m"] = agg.wm / agg.w
mult = agg.pivot(index=["GAME_ID", "personId"], columns="stat", values="m")
evcnt = agg.pivot(index=["GAME_ID", "personId"], columns="stat", values="w")
pg = pg.merge(mult.add_prefix("m_").reset_index(), on=["GAME_ID", "personId"], how="left")
pg = pg.merge(evcnt.add_prefix("n_").reset_index(), on=["GAME_ID", "personId"], how="left")

match = []
for s in STATS:
    pg["m_" + s] = pg.get("m_" + s, pd.Series(np.nan, index=pg.index)).fillna(1.0)
    pg["n_" + s] = pg.get("n_" + s, pd.Series(np.nan, index=pg.index)).fillna(0)
    pg["b_" + s] = pg[s] * pg["m_" + s]
    match.append({"stat": s, "box_total": pg[s].sum(), "pbp_matched": pg["n_" + s].sum(),
                  "share": pg["n_" + s].sum() / pg[s].sum(),
                  "player_games_exact": (pg["n_" + s] == pg[s]).mean()})
match = pd.DataFrame(match)

# ---------- STEP 3: per player-game scores ----------
b = lambda s: pg["b_" + s]
pg["GS"] = (b("PTS") + 0.4 * b("FGM") - 0.7 * b("FGA") - 0.4 * (b("FTA") - b("FTM")) + 0.7 * b("OREB")
            + 0.3 * b("DREB") + b("STL") + 0.7 * b("AST") + 0.7 * b("BLK") - 0.4 * b("PF") - b("TOV"))
pg["FP_box"] = (2 * b("PTS") + 4 * b("FGM") - 2 * b("FGA") + 2 * b("FTM") - 1 * b("FTA") + 2 * b("3PM")
                - 1 * (b("3PA") - b("3PM")) + 1 * b("OREB") + 2 * b("DREB") + 4 * b("AST") + 7 * b("STL")
                + 9 * b("BLK") - 4 * b("TOV") - 1 * b("PF"))
ncat = (pg[["PTS", "REB", "AST", "STL", "BLK"]] >= 10).sum(axis=1)
pg["bonus_multicat"] = np.select([ncat >= 4, ncat == 3, ncat == 2], [20, 8, 5], 0)
pg["bonus_win"] = np.where(pg.WL == "W", 5, 0)

pen = []
ej = pbp[pbp.actionType == "Ejection"]
pen += [(g, p, -5) for g, p in zip(ej.GAME_ID, ej.personId)]
fl = pbp[(pbp.actionType == "Foul") & pbp.subType.isin(["Flagrant Type 1", "Flagrant Type 2"])]
pen += [(g, p, -3) for g, p in zip(fl.GAME_ID, fl.personId)]
tc = pbp[(pbp.actionType == "Foul") & pbp.subType.isin(["Technical", "Hanging Technical"])]
pen += [(g, p, -2) for g, p in zip(tc.GAME_ID, tc.personId)]
for _, r in pbp[(pbp.actionType == "Foul") & (pbp.subType == "Double Technical")].iterrows():
    m = re.match(r"Double Technical - (.+?) \(", r.desc)
    named = [n.strip() for n in m.group(1).split(",")] if m else []
    if len(named) == 2 and norm(named[0]) == norm(named[1]):  # e.g. "Green, Green": both players with that name
        both = {c for c in by_game.get((r.GAME_ID, norm(named[0])), set()) if (r.GAME_ID, c) in in_box}
        if len(both) == 2:
            pen += [(r.GAME_ID, c, -2) for c in both]
            continue
    for n in named:
        pid = lookup(r.GAME_ID, n, None, "Double Technical")
        if pid is not None:
            pen.append((r.GAME_ID, pid, -2))
pen = pd.DataFrame(pen, columns=["GAME_ID", "personId", "pen"])
pen = pen[[(g, p) in in_box for g, p in zip(pen.GAME_ID, pen.personId)]]
pg = pg.merge(pen.groupby(["GAME_ID", "personId"]).pen.sum().rename("penalties").reset_index(),
              on=["GAME_ID", "personId"], how="left")
pg["penalties"] = pg.penalties.fillna(0)
pg["FP"] = pg.FP_box + pg.bonus_multicat + pg.bonus_win + pg.penalties

# ---------- STEP 4: defense ----------
hus = read("boxscorehustlev2_PlayerStats.csv")[["GAME_ID", "personId"] + DEF[:5]]
dfn = read("boxscoredefensivev2_PlayerStats.csv")
trk = read("boxscoreplayertrackv3_PlayerStats.csv")
lgFG = dfn.matchupFieldGoalsMade.sum() / dfn.matchupFieldGoalsAttempted.sum()
lgRim = trk.defendedAtRimFieldGoalsMade.sum() / trk.defendedAtRimFieldGoalsAttempted.sum()
dfn["fgSaved"] = lgFG * dfn.matchupFieldGoalsAttempted - dfn.matchupFieldGoalsMade
trk["rimSaved"] = lgRim * trk.defendedAtRimFieldGoalsAttempted - trk.defendedAtRimFieldGoalsMade
pg = pg.merge(hus, on=["GAME_ID", "personId"], how="left")
pg = pg.merge(dfn[["GAME_ID", "personId", "fgSaved"]], on=["GAME_ID", "personId"], how="left")
pg = pg.merge(trk[["GAME_ID", "personId", "rimSaved"]], on=["GAME_ID", "personId"], how="left")
q = pg[pg.qual].copy()
missing_def = {st: {c: int(g[c].isna().sum()) for c in DEF} for st, g in q.groupby("SEASON_TYPE")}


# ---------- STEP 5/6 helpers ----------
def zscore(s):
    return (s - s.mean()) / s.std(ddof=0)


def defense_points(blk, cols):
    """blk: one row per (player, block) with defense columns and nq. Returns defense points (0 outside pool)."""
    out = pd.Series(0.0, index=blk.index)
    pools = {}
    for bn, g in blk.groupby("block"):
        pool = g[g.nq >= 3]
        pools[bn] = len(pool)
        z = pd.concat([zscore(pool[c]) for c in cols], axis=1)
        comp = z.mean(axis=1, skipna=True)
        out.loc[pool.index] = (2 * zscore(comp)).fillna(0)
    return out, pools


def season(blk, col, min_minutes=0):
    g = blk[(blk.nq >= 1) & (blk["min"] >= min_minutes if min_minutes else True)].assign(_w=lambda d: d.block.map(BLOCK_W))
    return (g[col] * g._w).groupby(g.personId).sum() / g._w.groupby(g.personId).sum()


# ---------- STEP 5: Weekly Power ----------
def wavg(g, col):
    m = g[col].notna()
    return np.average(g.loc[m, col], weights=g.loc[m, "slot_w"]) if m.any() else np.nan


wk = q.groupby(["personId", "block"]).apply(
    lambda g: pd.Series({"nq": len(g), "GS": wavg(g, "GS"), "FP": wavg(g, "FP"),
                         **{c: wavg(g, c) for c in DEF}}), include_groups=False).reset_index()
wk["defpts"], wk_pools = defense_points(wk, DEF)
wk["nba"] = wk.GS + wk.defpts

# ---------- STEP 6: Minutes Power ----------
def totals(g):
    d = {"nq": len(g), "min": g.MIN.sum(), "GS48": 48 * g.GS.sum() / g.MIN.sum(),
         "FP48": 48 * g.FP.sum() / g.MIN.sum()}
    for c in DEF:
        m = g[c].notna()
        d[c] = 48 * g.loc[m, c].sum() / g.loc[m, "MIN"].sum() if m.any() else np.nan
    return pd.Series(d)


mn = q.groupby(["personId", "block"]).apply(totals, include_groups=False).reset_index()
mn["defpts"], mn_pools = defense_points(mn, DEF)
mn["nba"] = mn.GS48 + mn.defpts

# ---------- STEP 7: output ----------
info = q.sort_values("RECENCY_RANK").groupby("personId").agg(
    player=("player", "first"), qualifying_games=("qual", "size"), total_minutes=("MIN", "sum"))
info["team"] = q.sort_values(["GAME_DATE"], ascending=False).groupby("personId").TEAM_ABBREVIATION.agg(
    lambda s: "/".join(dict.fromkeys(s)))
info["total_minutes"] = info.total_minutes.round(1)


def ranking(score, comps):
    df = info.join(pd.DataFrame({"score": score, **comps})).dropna(subset=["score"])
    df = df.sort_values("score", ascending=False).head(100).reset_index(drop=True)
    df.insert(0, "rank", df.index + 1)
    return df[["rank", "player", "team", "score", "qualifying_games", "total_minutes"] + list(comps)]


ranks = {
    "Weekly NBA": ranking(season(wk, "nba"), {"avg_game_score": season(wk, "GS"),
                                              "defense_points": season(wk, "defpts")}),
    "Weekly Fantasy": ranking(season(wk, "FP"), {"avg_fantasy_points": season(wk, "FP")}),
    "Minutes NBA": ranking(season(mn, "nba", BLOCK_MIN), {"game_score_per48": season(mn, "GS48", BLOCK_MIN),
                                                          "defense_points": season(mn, "defpts", BLOCK_MIN)}),
    "Minutes Fantasy": ranking(season(mn, "FP48", BLOCK_MIN), {"fantasy_per48": season(mn, "FP48", BLOCK_MIN)}),
}
for k in ("Minutes NBA", "Minutes Fantasy"):
    ranks[k]["under_100_total_min"] = ranks[k].total_minutes < 100
    if BLOCK_MIN:
        ok = mn[mn["min"] >= BLOCK_MIN]
        pid = ranks[k].player.map(info.reset_index().set_index("player").personId)
        ranks[k]["counted_blocks"] = pid.map(ok.groupby("personId").block.count())
        ranks[k]["counted_block_minutes"] = pid.map(ok.groupby("personId")["min"].sum()).round(1)
print("Minutes Power eligible players (>=1 counted block):", mn[mn["min"] >= BLOCK_MIN].personId.nunique())

# Weekly outputs never take the suffix. (No xlsx: the CSVs are what publish_rankings.py reads.)
for k, df in ranks.items():
    sfx = SUFFIX if k.startswith("Minutes") else ""
    df.round(3).to_csv(OUT / f"ranking_{k.lower().replace(' ', '_')}{sfx}.csv", index=False)
match.to_csv(OUT / "pbp_match_rates.csv", index=False)
pg.to_csv(OUT / "player_games_scored.csv", index=False)

# ---------- report ----------
pd.set_option("display.width", 200)
per_team = sel.groupby("TEAM_ID").size()
print(f"games per team: min={per_team.min()} max={per_team.max()}; preseason team-games="
      f"{int((sel.SEASON_TYPE == 'Preseason').sum())} (unique preseason games="
      f"{sel[sel.SEASON_TYPE == 'Preseason'].GAME_ID.nunique()}); teams={len(per_team)}")
print("games with a box score:", pg.groupby("SEASON_TYPE").GAME_ID.nunique().to_dict())
for k, df in ranks.items():
    n = 50 if k == "Weekly NBA" else 25
    print(f"\n### {k} top {n}\n" + df.head(n)[["rank", "player", "team", "score"]].round(2).to_string(index=False))
print("\n### PBP match rates\n" + match.round(4).to_string(index=False))
print(f"\nlgFG={lgFG:.4f} lgRim={lgRim:.4f}")
print("weekly z-pool per block:", wk_pools, " minutes z-pool per block:", mn_pools)
print("flagged <100 min:", {k: int(ranks[k].under_100_total_min.sum()) for k in ("Minutes NBA", "Minutes Fantasy")})
print("unmatched names:", {k: len(v) for k, v in unmatched.items()})
pd.DataFrame([(k, *v) for k, vs in unmatched.items() for v in vs], columns=["kind", "GAME_ID", "name", "n_candidates"]).to_csv(OUT / "pbp_unmatched_names.csv", index=False)
print("qualifying player-games missing a defense source (left out of that stat):", missing_def)
print("player-games:", len(pg), "qualifying:", int(pg.qual.sum()), "players:", q.personId.nunique())
print("bonus counts:", pg[pg.qual].bonus_multicat.value_counts().to_dict(),
      "penalty player-games:", int((pg.penalties < 0).sum()))
