"""Raw data pull for the nightly in-season power rankings: each team's last 20 games of the
2026-27 regular season (rolling, newest first; early in the season, as many regular-season games as
each team has played, with no preseason and no 2025-26 top-up).

Adapted from model/pull_draft.py. Per-game endpoint files are cached in model/raw_cache/ with .done
markers so routine nightly runs only fetch new games. Combined CSVs for the current 20-game window
are written to model/data_season/.
"""
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
SEASON = "2026-27"
GAMES_PER_TEAM = 20
DELAY = 1.0
TIMEOUT = 30
COOLDOWN = 30
MAX_CONSECUTIVE_FAILURES = 5
MAX_RUNTIME = 20 * 60  # 20 minutes ceiling so a slow stats.nba.com day never hits the 30-min runner limit
HERE = Path(__file__).resolve().parent
DATA = HERE / "data_season"
CACHE = HERE / "raw_cache"
DATA.mkdir(exist_ok=True)
CACHE.mkdir(exist_ok=True)

ENDPOINTS = {
    "boxscoretraditionalv3": boxscoretraditionalv3.BoxScoreTraditionalV3,
    "boxscorehustlev2": boxscorehustlev2.BoxScoreHustleV2,
    "boxscoredefensivev2": boxscoredefensivev2.BoxScoreDefensiveV2,
    "playbyplayv3": playbyplayv3.PlayByPlayV3,
    "boxscoreplayertrackv3": boxscoreplayertrackv3.BoxScorePlayerTrackV3,
}


def call(fn, attempts=3, **kw):
    for attempt in range(1, attempts + 1):
        try:
            time.sleep(DELAY)
            return fn(timeout=TIMEOUT, **kw)
        except AttributeError as e:
            # stats.nba.com returned HTTP 200 with a null dataset (e.g. tracking not posted yet); retrying won't help
            print(f"  data not available yet: {type(e).__name__}: {e}", flush=True)
            raise
        except Exception as e:  # timeouts, connection resets, bad JSON
            print(f"  attempt {attempt} failed: {type(e).__name__}: {e}", flush=True)
            if attempt < attempts:
                time.sleep(10 * 2 ** (attempt - 1))  # 10s, 20s
    raise RuntimeError(f"{attempts} attempts failed")


def game_log(season, season_type):
    df = call(
        leaguegamelog.LeagueGameLog,
        season=season,
        season_type_all_star=season_type,
        player_or_team_abbreviation="T",
    ).get_data_frames()[0]
    df["GAME_ID"] = df["GAME_ID"].astype(str)
    return df


def main():
    started = time.monotonic()
    reg = game_log(SEASON, "Regular Season")
    reg.to_csv(DATA / f"team_game_log_{SEASON}.csv", index=False)

    # Keep finished regular-season games only, newest first per team, up to GAMES_PER_TEAM
    reg = reg[reg["WL"].isin(["W", "L"])].copy()
    newest = ["TEAM_ID", "GAME_DATE", "GAME_ID"]
    reg = reg.sort_values(newest, ascending=[True, False, False]).assign(SEASON_TYPE="Regular Season")
    sel = reg.groupby("TEAM_ID").head(GAMES_PER_TEAM).copy()
    sel["RECENCY_RANK"] = sel.groupby("TEAM_ID").cumcount() + 1  # 1 = most recent
    cols = ["TEAM_ID", "TEAM_ABBREVIATION", "GAME_ID", "GAME_DATE", "MATCHUP", "WL", "SEASON_TYPE", "RECENCY_RANK"]
    sel[cols].to_csv(DATA / "selected_team_games.csv", index=False)

    game_ids = sorted(sel["GAME_ID"].unique())
    per_team = sel.groupby("TEAM_ID").size()
    print(
        f"season={SEASON} teams={sel.TEAM_ID.nunique()} selected team-games={len(sel)} "
        f"unique games={len(game_ids)} games/team min={per_team.min() if len(per_team) else 0} "
        f"max={per_team.max() if len(per_team) else 0}",
        flush=True,
    )

    failed, fetched, cached, consec_failures = [], 0, 0, 0
    aborted = False
    for i, gid in enumerate(game_ids, 1):
        for name, cls in ENDPOINTS.items():
            done = CACHE / f"{name}_{gid}.done"
            if done.exists():
                cached += 1
                continue
            if time.monotonic() - started >= MAX_RUNTIME:
                failed.append({"GAME_ID": gid, "endpoint": name, "error": "max runtime reached"})
                print(f"STOPPING early: reached {MAX_RUNTIME}s runtime budget", flush=True)
                aborted = True
                break
            if consec_failures >= MAX_CONSECUTIVE_FAILURES:
                failed.append({"GAME_ID": gid, "endpoint": name, "error": "too many consecutive failures"})
                print(f"STOPPING early: {consec_failures} consecutive network failures", flush=True)
                aborted = True
                break
            try:
                ep = call(cls, attempts=3, game_id=gid)
                sets = ep.nba_response.get_data_sets(ep.endpoint).items()
                for ds_name, ds in sets:
                    df = pd.DataFrame(ds["data"], columns=ds["headers"])
                    df.insert(0, "GAME_ID", gid)
                    df.to_csv(CACHE / f"{name}__{ds_name}__{gid}.csv", index=False)
                done.touch()
                fetched += 1
                consec_failures = 0
            except AttributeError as e:
                failed.append({"GAME_ID": gid, "endpoint": name, "error": f"{type(e).__name__}: {e}"})
                print(f"FAILED {name} {gid}: {e}", flush=True)
            except Exception as e:
                failed.append({"GAME_ID": gid, "endpoint": name, "error": str(e)})
                consec_failures += 1
                print(f"FAILED {name} {gid}: {e}", flush=True)
                if consec_failures < MAX_CONSECUTIVE_FAILURES:
                    print(f"  cooling down {COOLDOWN}s", flush=True)
                    time.sleep(COOLDOWN)
        if aborted:
            break
        if i % 10 == 0:
            print(f"{i}/{len(game_ids)} games checked (fetched={fetched} cached={cached})", flush=True)

    pd.DataFrame(failed, columns=["GAME_ID", "endpoint", "error"]).to_csv(DATA / "failed_calls.csv", index=False)
    print(f"done; fetched={fetched} cached={cached} failed calls={len(failed)}", flush=True)

    # combine the selected games only: one CSV per endpoint dataset
    keep = set(game_ids)
    for name in ENDPOINTS:
        groups = {}
        for f in sorted(CACHE.glob(f"{name}__*__*.csv")):
            ds_name, gid = f.stem.split("__")[1:3]
            if gid in keep:
                groups.setdefault(ds_name, []).append(pd.read_csv(f, dtype={"GAME_ID": str, "gameId": str}))
        for ds_name, dfs in groups.items():
            non_empty = [d for d in dfs if len(d)]
            out = pd.concat(non_empty, ignore_index=True) if non_empty else dfs[0].iloc[0:0]
            out.to_csv(DATA / f"{name}_{ds_name}.csv", index=False)
            print(f"{name}_{ds_name}.csv rows={len(out)}", flush=True)

    return 1 if aborted else 0


if __name__ == "__main__":
    sys.exit(main())
