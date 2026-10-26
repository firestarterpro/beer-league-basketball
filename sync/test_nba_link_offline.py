"""Offline check of `nba_sync.py link`: name matching, and the writes against a real Postgres.

Uses made-up NBA.com rows, so it proves the matching rules, not NBA.com's live list; the first
`python nba_sync.py link --dry-run` on the LM's PC shows how the real names line up.

    DATABASE_URL=postgresql://... python test_nba_link_offline.py
"""

import os

import psycopg

import nba_sync as n

ROSTER = {"headers": ["PERSON_ID", "DISPLAY_LAST_COMMA_FIRST", "DISPLAY_FIRST_LAST", "ROSTERSTATUS", "TEAM_ABBREVIATION"],
          "data": [[1641705, "Wembanyama, Victor", "Victor Wembanyama", 1, "SAS"],
                   [203999, "Jokić, Nikola", "Nikola Jokić", 1, "DEN"],
                   [1629029, "Doncic, Luka", "Luka Dončić", 1, "LAL"],
                   [1629651, "Claxton, Nic", "Nic Claxton", 1, "BKN"],
                   [1630538, "Hyland, Bones", "Bones Hyland", 1, "LAC"],
                   [1630231, "Martin, KJ", "KJ Martin", 1, "PHI"],
                   [1642385, "Yongxi, Cui", "Cui Yongxi", 1, "BKN"],
                   [1629023, "Washington, P.J.", "P.J. Washington", 1, "DAL"],
                   [202710, "Butler III, Jimmy", "Jimmy Butler III", 1, "GSW"],
                   [900001, "Smith, Chris", "Chris Smith", 1, "UTA"],
                   [900002, "Smith, Chris", "Chris Smith", 1, "DAL"],
                   [900003, "Holiday, Jrue", "Jrue Holiday", 1, "POR"],
                   [900004, "Holiday, Justin", "Justin Holiday", 1, "POR"],
                   [None, "Nobody", "", 1, ""]]}

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))


def main():
    people = n.parse_roster(ROSTER)
    check("roster rows parsed, blanks skipped", len(people) == 13 and people[0] == (1641705, "Victor Wembanyama", "SAS"))
    check("first names: prefix, initials, nickname list; not strangers",
          n.first_names_match("nic", "nicolas") and n.first_names_match("kj", "kenyon")
          and n.first_names_match("bones", "nahshon") and not n.first_names_match("jrue", "justin"))

    espn = [("e1", "Victor Wembanyama", "SAS"), ("e2", "Nikola Jokic", "DEN"), ("e3", "Luka Doncic", "LAL"),
            ("e4", "Nicolas Claxton", "BKN"), ("e5", "Nah'Shon Hyland", "LAC"), ("e6", "Kenyon Martin Jr.", "PHL"),
            ("e7", "Yongxi Cui", "BKN"), ("e8", "PJ Washington", "DAL"), ("e9", "Jimmy Butler", "GSW"),
            ("e10", "Chris Smith", "UTA"), ("e11", "Chris Smith", "FA"), ("e12", "Jordan Holiday", "POR"),
            ("e13", "Made Up Guy", "FA")]
    links, unmatched = n.match_people(espn, people)
    got = {k: v[0] for k, v in links.items()}
    how = {k: v[1] for k, v in links.items()}
    check("exact names, accents, punctuation and suffixes", got.get("e1") == 1641705 and got.get("e2") == 203999
          and got.get("e3") == 1629029 and got.get("e8") == 1629023 and got.get("e9") == 202710, str(got))
    check("name order (Yongxi Cui / Cui Yongxi)", got.get("e7") == 1642385 and how.get("e7") == "name order")
    check("nicknames on the same team (Nicolas/Nic, Nah'Shon/Bones, Kenyon/KJ with PHL = PHI)",
          got.get("e4") == 1629651 and got.get("e5") == 1630538 and got.get("e6") == 1630231
          and {how[k] for k in ("e4", "e5", "e6")} == {"nickname"})
    check("a shared name goes to the one on the same team", got.get("e10") == 900001)
    check("...and isn't handed to the free agent by elimination", "e11" not in got,
          next((w for nm, t, w in unmatched if t == "FA" and nm == "Chris Smith"), ""))
    check("no guess between two same-team players with other first names", "e12" not in got)
    check("unknown players listed", any(nm == "Made Up Guy" for nm, _, _ in unmatched))

    links, _ = n.match_people([("a", "Nic Claxton", "BKN")], people, taken=[1629651])
    check("an NBA id already on a player is never reused", not links)
    links, unmatched = n.match_people([("a", "P.J. Washington", "DAL"), ("b", "PJ Washington", "DAL")], people)
    check("two ESPN players wanting one NBA player get neither", not links and len(unmatched) == 2, str(unmatched))

    real = n.CommonAllPlayers
    def broken(*a, **k):
        raise TimeoutError("stats.nba.com timed out")
    n.CommonAllPlayers = broken
    try:
        fallback = n.nba_roster("2026-27")
    finally:
        n.CommonAllPlayers = real
    check("falls back to nba_api's built-in list", len(fallback) > 300 and all(t == "" for _, _, t in fallback), str(len(fallback)))

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
        # Keep the database's own players out of the way (all of this is rolled back).
        cur.execute("UPDATE players SET name = name || ' (old)' WHERE nba_person_id IS NULL")
        cur.execute("UPDATE players SET nba_person_id = NULL WHERE nba_person_id = ANY(%s)", ([p for p, _, _ in people],))
        cur.executemany("INSERT INTO players (player_id, name, nba_team) VALUES (%s, %s, %s)", espn)
        cur.execute("INSERT INTO players (player_id, name, nba_team, nba_person_id) VALUES ('e0', 'Jrue Holiday', 'POR', 900003)")
        links, unmatched, names = n.link(cur, people)
        cur.execute("SELECT player_id, nba_person_id FROM players WHERE player_id LIKE 'e%' AND nba_person_id IS NOT NULL")
        saved = dict(cur.fetchall())
        check("links written to players", saved.get("e4") == 1629651 and saved.get("e7") == 1642385 and len(saved) == 11,
              f"{len(saved)} with an id, e0 included")
        check("an id on another player stays put", saved.get("e0") == 900003 and "e12" not in saved)
        cur.execute("SELECT count(*) FROM nba_people WHERE nba_person_id = ANY(%s)", ([p for p, _, _ in people],))
        check("NBA.com people saved for next time", cur.fetchone()[0] == 13)
        again, unmatched, _ = n.link(cur, people)
        check("a second run finds nothing new (the free-agent Chris Smith still isn't guessed)", not again, str(again))
        conn.rollback()
    print(f"{sum(results)} passed, {len(results) - sum(results)} failed")


if __name__ == "__main__":
    main()
