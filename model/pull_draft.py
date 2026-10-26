"""Raw data pull for the draft-day tiers: each team's 2026-27 preseason games, then 2025-26
regular-season games, skipping each team's last 5 regular-season games (play-in and playoffs are
never in the regular-season log). 20 games per team.

Adapted from beer-league-sample/pull_sample.py. Pulls only. Per-game files the sample already has
are copied from its raw_cache (read-only); everything else is fetched from stats.nba.com into
model/raw_cache/ so the script can be re-run to resume.
"""
import shutil
import sys
import time
from pathlib import Path

import pandas as pd
from nba_api.stats.endpoints import (
    boxscoredefensivev2,
    boxscorehustlev2,
    boxscoreplayertrackv3,
    boxscoretraditionalv3,
    leaguegamelog,
    playbyplayv3,
)

sys.stdout.reconfigure(encoding="utf-8")
LAST_SEASON = "2025-26"
PRESEASON = "2026-27"
GAMES_PER_TEAM = 20
SKIP_LAST_REGULAR = 5
DELAY = 1.0
TIMEOUT = 45
HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
CACHE = HERE / "raw_cache"
SAMPLE = HERE.parent.parent / "beer-league-sample"
SAMPLE_CACHE = SAMPLE / "raw_cache"
DATA.mkdir(exist_ok=True)
CACHE.mkdir(exist_ok=True)

ENDPOINTS = {
    "boxscoretraditionalv3": boxscoretraditionalv3.BoxScoreTraditionalV3,
    "boxscorehustlev2": boxscorehustlev2.BoxScoreHustleV2,
    "boxscoredefensivev2": boxscoredefensivev2.BoxScoreDefensiveV2,
    "playbyplayv3": playbyplayv3.PlayByPlayV3,
    "boxscoreplayertrackv3": boxscoreplayertrackv3.BoxScorePlayerTrackV3,
}
# Tracking-based endpoints may not exist for preseason; after this many preseason misses, stop asking.
PRESEASON_GIVE_UP = 3


def call(fn, attempts=3, **kw):
    for attempt in range(1, attempts + 1):
        try:
            time.sleep(DELAY)
            return fn(timeout=TIMEOUT, **kw)
        except Exception as e:  # timeouts, connection resets, bad JSON
            print(f"  attempt {attempt} failed: {type(e).__name__}: {e}", flush=True)
            if attempt < attempts:
                time.sleep(15 * 2 ** attempt)  # 30s, 60s
    raise RuntimeError(f"{attempts} attempts failed")


def game_log(season, season_type, cached=None):
    if cached and cached.exists():
        return pd.read_csv(cached, dtype={"GAME_ID": str})
    return call(leaguegamelog.LeagueGameLog, season=season, season_type_all_star=season_type,
                player_or_team_abbreviation="T").get_data_frames()[0]


def main():
    reg = game_log(LAST_SEASON, "Regular Season", SAMPLE / "team_game_log_2025-26.csv")
    pre = game_log(PRESEASON, "Pre Season")
    reg.to_csv(DATA / "team_game_log_2025-26.csv", index=False)
    pre.to_csv(DATA / "team_game_log_2026-27_preseason.csv", index=False)

    newest = ["TEAM_ID", "GAME_DATE", "GAME_ID"]
    pre = pre[pre.TEAM_ID.isin(reg.TEAM_ID)]  # NBA teams only (the preseason log also lists visiting clubs)
    pre = pre.sort_values(newest, ascending=[True, False, False]).assign(SEASON_TYPE="Preseason")
    reg = reg.sort_values(newest, ascending=[True, False, False]).assign(SEASON_TYPE="Regular Season")
    reg = reg[reg.groupby("TEAM_ID").cumcount() >= SKIP_LAST_REGULAR]  # drop each team's last 5
    both = pd.concat([pre, reg], ignore_index=True)  # preseason first = newest
    both["_order"] = both.groupby("TEAM_ID").cumcount()
    sel = both.sort_values(["TEAM_ID", "_order"]).groupby("TEAM_ID").head(GAMES_PER_TEAM).copy()
    sel["RECENCY_RANK"] = sel.groupby("TEAM_ID").cumcount() + 1  # 1 = most recent
    sel[["TEAM_ID", "TEAM_ABBREVIATION", "GAME_ID", "GAME_DATE", "MATCHUP", "WL", "SEASON_TYPE", "RECENCY_RANK"]] \
        .to_csv(DATA / "selected_team_games.csv", index=False)
    game_ids = sorted(sel["GAME_ID"].unique())
    per_team = sel.groupby("TEAM_ID").size()
    print(f"teams={sel.TEAM_ID.nunique()} selected team-games={len(sel)} unique games={len(game_ids)} "
          f"preseason team-games={(sel.SEASON_TYPE == 'Preseason').sum()} games/team min={per_team.min()} "
          f"max={per_team.max()}", flush=True)

    failed, copied, misses = [], 0, {n: 0 for n in ENDPOINTS}
    for i, gid in enumerate(game_ids, 1):
        is_pre = gid.startswith("001")
        for name, cls in ENDPOINTS.items():
            done = CACHE / f"{name}_{gid}.done"
            if done.exists():
                continue
            if (SAMPLE_CACHE / f"{name}_{gid}.done").exists():
                for f in SAMPLE_CACHE.glob(f"{name}__*__{gid}.csv"):
                    shutil.copy2(f, CACHE / f.name)
                done.touch()
                copied += 1
                continue
            if is_pre and misses[name] >= PRESEASON_GIVE_UP:
                continue
            try:
                ep = call(cls, attempts=1 if is_pre else 3, game_id=gid)
                sets = ep.nba_response.get_data_sets(ep.endpoint).items()
                rows = 0
                for ds_name, ds in sets:
                    df = pd.DataFrame(ds["data"], columns=ds["headers"])
                    rows += len(df)
                    df.insert(0, "GAME_ID", gid)
                    df.to_csv(CACHE / f"{name}__{ds_name}__{gid}.csv", index=False)
                if is_pre and rows == 0:
                    misses[name] += 1
                done.touch()
            except Exception as e:
                failed.append({"GAME_ID": gid, "endpoint": name, "error": str(e)})
                print(f"FAILED {name} {gid}: {e}", flush=True)
                if is_pre:
                    misses[name] += 1
                else:
                    print("  cooling down 5 min", flush=True)
                    time.sleep(300)
        if i % 10 == 0:
            print(f"{i}/{len(game_ids)} games done", flush=True)

    pd.DataFrame(failed, columns=["GAME_ID", "endpoint", "error"]).to_csv(DATA / "failed_calls.csv", index=False)
    print(f"done; copied from sample={copied} failed calls={len(failed)} preseason misses={misses}", flush=True)

    # combine the selected games only: one CSV per endpoint dataset
    keep = set(game_ids)
    for name in ENDPOINTS:
        groups = {}
        for f in sorted(CACHE.glob(f"{name}__*__*.csv")):
            ds_name, gid = f.stem.split("__")[1:3]
            if gid in keep:
                groups.setdefault(ds_name, []).append(pd.read_csv(f, dtype={"GAME_ID": str, "gameId": str}))
        for ds_name, dfs in groups.items():
            dfs = [d for d in dfs if len(d)]
            if not dfs:
                continue
            out = pd.concat(dfs, ignore_index=True)
            out.to_csv(DATA / f"{name}_{ds_name}.csv", index=False)
            print(f"{name}_{ds_name}.csv rows={len(out)}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
