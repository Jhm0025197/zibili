"""Seeding.

Runs on an empty database so `python server.py` from a fresh clone lands on
a working app with no setup step. Everything it writes is synthetic and
marked `seeded = 1` in the events table, so a query can always tell made-up
history from what someone actually did.

Two parts, each idempotent, so the order of `ingest.py add` and
`server.py` does not matter:

1. people, courses, enrollments and prior spend, once `people` is empty;
2. assignments and a term of prior-term reading for each course, once the
   course's book has sections and the course has no assignments yet.

The current term starts empty on purpose: the college view has to be able
to say "no data yet" honestly, and the done condition is that reading three
sections makes them appear.
"""

from __future__ import annotations

import json
import logging
import random
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from ledger import Event, EventContext, iso, student_hash, utc_now, write_events

LOGGER = logging.getLogger("zibili.seed")

ENGAGEMENT: dict[str, dict[str, float]] = {
    "steady": {"coverage": 0.85, "finish": 0.8, "reread": 0.15},
    "burst": {"coverage": 0.7, "finish": 0.55, "reread": 0.05},
    "fading": {"coverage": 0.45, "finish": 0.5, "reread": 0.08},
    "quiet": {"coverage": 0.15, "finish": 0.3, "reread": 0.02},
}
DWELL_TICK_SECONDS = 15
WORDS_PER_MINUTE = 220
READ_FRACTION = 0.25
RANDOM_SEED = 0x21B17


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def has_seed(seed_dir: Path | None) -> bool:
    return bool(seed_dir) and (Path(seed_dir) / "course.json").is_file()


def ensure(connection: sqlite3.Connection, seed_dir: Path | None) -> dict[str, int]:
    """Seed whatever is still missing. Caller holds the transaction."""
    if not has_seed(seed_dir):
        return {"people": 0, "courses": 0, "events": 0}
    seed_dir = Path(seed_dir)
    people = seed_people(connection, seed_dir)
    courses, events = seed_course_content(connection, seed_dir)
    return {"people": people, "courses": courses, "events": events}


def seed_people(connection: sqlite3.Connection, seed_dir: Path) -> int:
    if connection.execute("SELECT COUNT(*) FROM people").fetchone()[0]:
        return 0
    course = _read_json(seed_dir / "course.json")
    students = _read_json(seed_dir / "students.json")["students"]
    spend = _read_json(seed_dir / "prior-spend.json")
    now = iso(utc_now())

    for person in course["people"]:
        connection.execute(
            "INSERT INTO people (id, role, display_name, student_hash, created_at) VALUES (?, ?, ?, NULL, ?)",
            (person["id"], person["role"], person["display_name"], now),
        )
    roster = [(s["id"], s["display_name"], student_hash(connection, s["id"])) for s in students]
    connection.executemany(
        "INSERT INTO people (id, role, display_name, student_hash, created_at) VALUES (?, 'student', ?, ?, ?)",
        [(pid, name, digest, now) for pid, name, digest in roster],
    )
    for c in course["courses"]:
        connection.execute(
            """
            INSERT INTO courses (id, code, title, term, term_label, starts_on, instructor_id, book_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (c["id"], c["code"], c["title"], c["term"], c["term_label"], c["starts_on"], c["instructor_id"], course["book_id"], now),
        )
        connection.executemany(
            "INSERT INTO enrollments (course_id, student_hash, enrolled_at) VALUES (?, ?, ?)",
            [(c["id"], digest, now) for _, _, digest in roster],
        )
    connection.executemany(
        "INSERT OR IGNORE INTO prior_spend (course_id, provider, fee_cents, note) VALUES (?, ?, ?, ?)",
        [(row["course_id"], row["provider"], row["fee_cents"], row.get("note")) for row in spend["courses"]],
    )
    connection.execute("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('seeded_people', ?)", (now,))
    total = len(course["people"]) + len(roster)
    LOGGER.info("seeded %d people, %d courses, %d enrollments", total, len(course["courses"]), len(roster) * len(course["courses"]))
    return total


def _assigned_sections(connection: sqlite3.Connection, book_id: str, chapters: list[int]) -> list[dict[str, Any]]:
    if not chapters:
        return []
    marks = ",".join("?" for _ in chapters)
    rows = connection.execute(
        f"""
        SELECT id, words, start_page FROM sections
        WHERE book_id = ? AND tombstoned = 0 AND number IS NOT NULL AND chapter IN ({marks})
        ORDER BY position
        """,
        (book_id, *chapters),
    ).fetchall()
    return [{"chunk_id": row["id"], "words": row["words"], "start_page": row["start_page"]} for row in rows]


def seed_course_content(connection: sqlite3.Connection, seed_dir: Path) -> tuple[int, int]:
    course = _read_json(seed_dir / "course.json")
    students = _read_json(seed_dir / "students.json")["students"]
    chapters = course.get("assignments", {}).get("chapters", [])
    seeded_courses = 0
    seeded_events = 0
    for c in course["courses"]:
        row = connection.execute("SELECT book_id FROM courses WHERE id = ?", (c["id"],)).fetchone()
        if row is None:
            continue
        if connection.execute("SELECT COUNT(*) FROM assignments WHERE course_id = ?", (c["id"],)).fetchone()[0]:
            continue
        assigned = _assigned_sections(connection, row["book_id"], chapters)
        if not assigned:
            continue
        now = iso(utc_now())
        connection.executemany(
            "INSERT INTO assignments (course_id, chunk_id, due_at, assigned_at) VALUES (?, ?, NULL, ?)",
            [(c["id"], section["chunk_id"], now) for section in assigned],
        )
        seeded_courses += 1
        if c.get("seeded_history"):
            seeded_events += _seed_history(connection, c, row["book_id"], assigned, students, now)
    if seeded_courses:
        LOGGER.info("seeded assignments for %d courses and %d prior-term events", seeded_courses, seeded_events)
    return seeded_courses, seeded_events


def _term_window(starts_on: str) -> tuple[datetime, datetime]:
    start = datetime.fromisoformat(starts_on).replace(tzinfo=timezone.utc)
    return start, start + timedelta(days=101)


def _seed_history(
    connection: sqlite3.Connection,
    c: dict[str, Any],
    book_id: str,
    assigned: list[dict[str, Any]],
    students: list[dict[str, Any]],
    now: str,
) -> int:
    rng = random.Random(RANDOM_SEED)
    term_start, term_end = _term_window(c["starts_on"])
    span = (term_end - term_start).total_seconds()
    written = 0
    for student in students:
        digest = student_hash(connection, student["id"])
        context = EventContext(digest, c["id"], c["instructor_id"], c["term"])
        engagement = student.get("engagement", "steady")
        profile = ENGAGEMENT.get(engagement, ENGAGEMENT["steady"])
        events: list[Event] = []
        for index, section in enumerate(assigned):
            through = index / (len(assigned) - 1) if len(assigned) > 1 else 0.0
            coverage = profile["coverage"] * (1 - through * 0.8) if engagement == "fading" else profile["coverage"]
            if rng.random() > coverage:
                continue
            if engagement == "burst":
                when = term_start + timedelta(seconds=span * (0.72 + rng.random() * 0.2))
            else:
                when = term_start + timedelta(seconds=span * (through * 0.85 + rng.random() * 0.12))

            def at(offset_seconds: float) -> datetime:
                return when + timedelta(seconds=offset_seconds)

            base = {"page": section["start_page"], "seeded": True}
            events.append(Event("opened", book_id, [section["chunk_id"]], None, dict(base), at(0)))
            estimated = max(30.0, section["words"] / WORDS_PER_MINUTE * 60)
            attention = estimated * (0.25 + rng.random() * 1.1)
            ticks = max(1, round(attention / DWELL_TICK_SECONDS))
            for tick in range(ticks):
                events.append(
                    Event("dwelled", book_id, [section["chunk_id"]], None, {**base, "seconds": DWELL_TICK_SECONDS}, at((tick + 1) * DWELL_TICK_SECONDS))
                )
            dwelt = ticks * DWELL_TICK_SECONDS
            if dwelt >= estimated * READ_FRACTION and rng.random() < profile["finish"]:
                events.append(Event("read", book_id, [section["chunk_id"]], None, {**base, "seconds": dwelt}, at(dwelt + 5)))
            if rng.random() < profile["reread"]:
                events.append(Event("reread", book_id, [section["chunk_id"]], None, dict(base), at(dwelt + 86400)))
                events.append(
                    Event("dwelled", book_id, [section["chunk_id"]], None, {**base, "seconds": DWELL_TICK_SECONDS}, at(dwelt + 86400 + DWELL_TICK_SECONDS))
                )
        if events:
            written += write_events(connection, events, context, seeded=True, received_at=now)
    return written
