"""Checks sync_runner.plan() against Jason's schedule with a fake clock. No network, no database.

    python test_sync_runner.py
"""

from datetime import datetime, timedelta

import sync_runner as r

C = r.CENTRAL
results = []


def at(day, hhmm):
    h, m = map(int, hhmm.split(":"))
    return datetime(2026, 11, day, h, m, tzinfo=C)


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))


def jobs(result):
    return [j for j, _ in result["jobs"]]


def run_day(state, tips, final_at_time, start, end, step=1, settings=None):
    """Simulate ticks every `step` minutes; games go final at final_at_time. Returns the jobs run."""
    ran = []
    now = start
    while now <= end:
        all_final = final_at_time is not None and now >= final_at_time
        res = r.plan(now, state, tips, all_final, settings or {"moves_every": 15})
        state.update(res["marks"])
        for j in jobs(res):
            if j != "check_moves":
                ran.append((now.strftime("%d %H:%M"), j))
        if "nightly" in jobs(res):
            state["nightly_day"] = now.date().isoformat()   # succeeded
        now += timedelta(minutes=step)
    return ran


def main():
    # slate dates roll at 5am Eastern = 4am Central
    check("late game counts for its own night", r.slate_date(at(4, "00:30")).isoformat() == "2026-11-03")
    check("morning is the new game date", r.slate_date(at(4, "07:00")).isoformat() == "2026-11-04")

    # A normal game night: tips 6:00pm-9:30pm, all final at 11:40pm
    tips = [at(3, "18:00"), at(3, "19:00"), at(3, "21:30")]
    state = {"nightly_day": "2026-11-03"}
    ran = run_day(state, tips, at(3, "23:40"), at(3, "12:00"), at(4, "09:00"))
    stats = [t for t, j in ran if j == "stats"]
    check("no stat runs before the first tip", all(t >= "03 18:00" for t in stats), stats[0] if stats else "")
    check("stat runs every 17 min during games", stats[:3] == ["03 18:00", "03 18:17", "03 18:34"], ", ".join(stats[:3]))
    check("stat runs stop once games are final", all(t <= "03 23:40" for t in stats), stats[-1])
    post = [t for t, j in ran if j == "postgame"]
    check("post-game run 30 min after the last game", post == ["04 00:10"], ", ".join(post))
    check("6am run skipped after a post-game run", not any(j == "nightly" for _, j in ran)
          and state.get("nightly_skipped"), state.get("nightly_skipped", ""))

    # PC was off overnight: no post-game run, so the morning run happens at 6:00
    state = {}
    ran = run_day(state, [], None, at(5, "05:50"), at(5, "09:00"))
    check("morning run at 6:00 when nothing ran after the games", [t for t, j in ran if j == "nightly"] == ["05 06:00"])

    # Morning run fails: retried every 15 min until 8:00, never after
    state = {}
    now, tries = at(6, "06:00"), []
    while now < at(6, "09:00"):
        res = r.plan(now, state, [], False, {"moves_every": 15})
        state.update(res["marks"])            # nightly_day never set = it kept failing
        if "nightly" in jobs(res):
            tries.append(now.strftime("%H:%M"))
        now += timedelta(minutes=1)
    check("failed morning run retried every 15 min until 8", tries[0] == "06:00" and tries[1] == "06:15"
          and tries[-1] == "07:45" and len(tries) == 8, ", ".join(tries))

    # No-game day: only move checks (and the morning run)
    state = {"nightly_day": "2026-11-07"}
    ran = run_day(state, [], None, at(7, "08:00"), at(7, "23:59"))
    check("no-game day runs nothing but move checks", ran == [], str(ran[:3]))

    # Move checks: every 1 or 15 min
    for every, expected in ((1, 60), (15, 4)):
        state, count, now = {}, 0, at(8, "12:00")
        while now < at(8, "13:00"):
            res = r.plan(now, state, [], False, {"moves_every": every})
            state.update(res["marks"])
            count += "check_moves" in jobs(res)
            now += timedelta(minutes=1)
        check(f"move check every {every} min", count == expected, f"{count} in an hour")

    # Sync Now: runs once per press
    state = {}
    first = r.plan(at(9, "15:00"), state, [], False, {"moves_every": 15, "sync_now": "2026-11-09T15:00:00"})
    state.update(first["marks"])
    again = r.plan(at(9, "15:01"), state, [], False, {"moves_every": 15, "sync_now": "2026-11-09T15:00:00"})
    check("Sync Now runs once per press", "quick" in jobs(first) and "quick" not in jobs(again))

    # A game that never reports final: stat runs stop 8 hours after the first tip, then post-game
    state = {"nightly_day": "2026-11-10"}
    ran = run_day(state, [at(10, "19:00")], None, at(10, "18:00"), at(11, "05:00"))
    stats = [t for t, j in ran if j == "stats"]
    post = [t for t, j in ran if j == "postgame"]
    check("stuck game: stat runs stop after 8 hours", stats[-1] < "11 03:00", stats[-1])
    check("stuck game: post-game still runs", post == ["11 03:30"], ", ".join(post))

    # Updates page: changed timings, paused jobs, Run now
    tips = [at(12, "18:00")]
    state = {"nightly_day": "2026-11-12"}
    ran = run_day(state, tips, at(12, "21:00"), at(12, "17:00"), at(13, "09:00"),
                  settings={"moves_every": 15, "stats_every": 30, "postgame_delay": 60})
    stats = [t for t, j in ran if j == "stats"]
    post = [t for t, j in ran if j == "postgame"]
    check("stats every 30 min when set", stats[:3] == ["12 18:00", "12 18:30", "12 19:00"], ", ".join(stats[:3]))
    check("post-game 60 min after when set", post == ["12 22:00"], ", ".join(post))

    state = {"nightly_day": "2026-11-13"}
    ran = run_day(state, [at(13, "18:00")], at(13, "21:00"), at(13, "17:00"), at(14, "09:00"),
                  settings={"moves_every": 15, "paused": ["stats", "postgame"]})
    check("paused stats and post-game don't run", not any(j in ("stats", "postgame") for _, j in ran),
          ", ".join(j for _, j in ran))
    check("morning run still covers a paused post-game", [j for _, j in ran] == ["nightly"], ", ".join(t for t, _ in ran))

    state = {"nightly_day": "2026-11-13"}
    ran = run_day(state, [], None, at(14, "05:00"), at(14, "10:00"), settings={"moves_every": 15, "nightly_hour": 8})
    check("morning run starts at the set hour", [t for t, j in ran if j == "nightly"] == ["14 08:00"])

    state = {}
    res = r.plan(at(15, "12:00"), state, [], False, {"moves_every": 15, "paused": ["moves"]})
    check("paused move checks don't run", "check_moves" not in jobs(res))
    req = {"job": "heat", "requested_at": "2026-11-15T18:00:00Z"}
    first = r.plan(at(15, "12:00"), state, [], False, {"paused": ["moves"], "run": req})
    state.update(first["marks"])
    again = r.plan(at(15, "12:01"), state, [], False, {"paused": ["moves"], "run": req})
    check("Run now runs once per press", jobs(first) == ["heat"] and jobs(again) == [])
    odd = r.plan(at(15, "12:00"), {}, [], False, {"run": {"job": "rm -rf", "requested_at": "x"}, "paused": ["moves"]})
    check("Run now ignores unknown jobs", jobs(odd) == [])
    check("bad schedule values are dropped",
          r.clean_schedule({"stats_every": "2", "postgame_delay": "45", "paused": ["stats", "nope"], "moves_every": None})
          == {"postgame_delay": 45, "paused": ["stats"]})

    print(f"{sum(results)} passed, {len(results) - sum(results)} failed")


if __name__ == "__main__":
    main()
