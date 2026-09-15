"""Reads over the ledger.

Two rules hold everywhere in this file:

1. Anything that resolves a student_hash to a name takes an instructor id and
   filters the course by it. There is no unscoped roster read.
2. Anything the college view calls returns aggregates only. It never selects
   a display name and never selects a student_hash.

`chunk_ids` is a JSON array because the schema is Postgres-shaped; the first
entry is the section the event is about, and that is what these queries
group by.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

PRIMARY_CHUNK = "json_extract(e.chunk_ids, '$[0]')"
DWELL_SECONDS = "COALESCE(json_extract(e.payload, '$.seconds'), 0)"
COURSE_SUMMARY = """
    SELECT c.id, c.code, c.title, c.term, c.term_label, c.starts_on, c.book_id, c.instructor_id,
           (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) AS enrolled,
           (SELECT COUNT(*) FROM assignments WHERE course_id = c.id) AS assigned
      FROM courses c
"""


def _rows(cursor: sqlite3.Cursor) -> list[dict[str, Any]]:
    return [dict(row) for row in cursor.fetchall()]


# --- instructor view ---------------------------------------------------------


def courses_for_instructor(connection: sqlite3.Connection, instructor_id: str) -> list[dict[str, Any]]:
    return _rows(
        connection.execute(
            COURSE_SUMMARY + " WHERE c.instructor_id = ? ORDER BY c.starts_on DESC, c.code", (instructor_id,)
        )
    )


def course_for_instructor(connection: sqlite3.Connection, course_id: str, instructor_id: str) -> dict[str, Any] | None:
    row = connection.execute(
        COURSE_SUMMARY + " WHERE c.id = ? AND c.instructor_id = ?", (course_id, instructor_id)
    ).fetchone()
    return dict(row) if row else None


def roster(connection: sqlite3.Connection, course_id: str, instructor_id: str) -> list[dict[str, Any]]:
    """The roster with the ledger joined in. The only query that turns a hash
    into a name, and it will not run without the instructor who owns the course."""
    return _rows(
        connection.execute(
            f"""
            WITH course AS (
                SELECT id FROM courses WHERE id = ? AND instructor_id = ?
            ),
            assigned AS (
                SELECT chunk_id FROM assignments WHERE course_id = (SELECT id FROM course)
            ),
            activity AS (
                SELECT e.student_hash,
                       MAX(e.occurred_at) AS last_active,
                       COUNT(DISTINCT CASE WHEN e.verb = 'opened' THEN {PRIMARY_CHUNK} END) AS sections_opened,
                       COUNT(DISTINCT CASE
                           WHEN e.verb = 'read' AND {PRIMARY_CHUNK} IN (SELECT chunk_id FROM assigned)
                           THEN {PRIMARY_CHUNK} END) AS assigned_read,
                       SUM(CASE WHEN e.verb = 'dwelled' THEN {DWELL_SECONDS} ELSE 0 END) AS dwell_seconds
                  FROM events e
                 WHERE e.course_id = (SELECT id FROM course)
                 GROUP BY e.student_hash
            )
            SELECT en.student_hash,
                   p.display_name,
                   a.last_active,
                   COALESCE(a.sections_opened, 0) AS sections_opened,
                   COALESCE(a.assigned_read, 0) AS assigned_read,
                   (SELECT COUNT(*) FROM assigned) AS assigned_total,
                   COALESCE(a.dwell_seconds, 0) AS dwell_seconds
              FROM enrollments en
              JOIN people p ON p.student_hash = en.student_hash
              LEFT JOIN activity a ON a.student_hash = en.student_hash
             WHERE en.course_id = (SELECT id FROM course)
             ORDER BY p.display_name
            """,
            (course_id, instructor_id),
        )
    )


def student_name(connection: sqlite3.Connection, course_id: str, instructor_id: str, student_hash: str) -> str | None:
    row = connection.execute(
        """
        SELECT p.display_name
          FROM people p
          JOIN enrollments en ON en.student_hash = p.student_hash
         WHERE en.course_id = (SELECT id FROM courses WHERE id = ? AND instructor_id = ?)
           AND p.student_hash = ?
        """,
        (course_id, instructor_id, student_hash),
    ).fetchone()
    return row["display_name"] if row else None


def student_trail(connection: sqlite3.Connection, course_id: str, instructor_id: str, student_hash: str) -> list[dict[str, Any]]:
    return _rows(
        connection.execute(
            f"""
            SELECT t.chunk_id, t.opened, t.reread, t.read, t.dwell_seconds, t.last_active,
                   s.number, s.title, s.start_page, s.chapter
              FROM (
                SELECT {PRIMARY_CHUNK} AS chunk_id,
                       SUM(CASE WHEN e.verb = 'opened' THEN 1 ELSE 0 END) AS opened,
                       SUM(CASE WHEN e.verb = 'reread' THEN 1 ELSE 0 END) AS reread,
                       SUM(CASE WHEN e.verb = 'read' THEN 1 ELSE 0 END) AS read,
                       SUM(CASE WHEN e.verb = 'dwelled' THEN {DWELL_SECONDS} ELSE 0 END) AS dwell_seconds,
                       MAX(e.occurred_at) AS last_active
                  FROM events e
                 WHERE e.course_id = (SELECT id FROM courses WHERE id = ? AND instructor_id = ?)
                   AND e.student_hash = ?
                 GROUP BY chunk_id
              ) t
              LEFT JOIN sections s ON s.id = t.chunk_id
             ORDER BY t.last_active DESC
            """,
            (course_id, instructor_id, student_hash),
        )
    )


def section_rollup(connection: sqlite3.Connection, course_id: str, instructor_id: str) -> list[dict[str, Any]]:
    return _rows(
        connection.execute(
            f"""
            SELECT r.chunk_id, r.readers, r.opens, r.finished, r.dwell_seconds, r.assigned,
                   s.number, s.title, s.start_page, s.chapter
              FROM (
                SELECT {PRIMARY_CHUNK} AS chunk_id,
                       COUNT(DISTINCT e.student_hash) AS readers,
                       SUM(CASE WHEN e.verb = 'opened' THEN 1 ELSE 0 END) AS opens,
                       COUNT(DISTINCT CASE WHEN e.verb = 'read' THEN e.student_hash END) AS finished,
                       SUM(CASE WHEN e.verb = 'dwelled' THEN {DWELL_SECONDS} ELSE 0 END) AS dwell_seconds,
                       (SELECT COUNT(*) FROM assignments a
                         WHERE a.course_id = e.course_id AND a.chunk_id = {PRIMARY_CHUNK}) AS assigned
                  FROM events e
                 WHERE e.course_id = (SELECT id FROM courses WHERE id = ? AND instructor_id = ?)
                 GROUP BY chunk_id
              ) r
              LEFT JOIN sections s ON s.id = r.chunk_id
            """,
            (course_id, instructor_id),
        )
    )


def assigned_sections(connection: sqlite3.Connection, course_id: str, instructor_id: str) -> list[dict[str, Any]]:
    return _rows(
        connection.execute(
            """
            SELECT a.chunk_id AS id, s.number, s.title, s.start_page, s.chapter, s.position
              FROM assignments a
              LEFT JOIN sections s ON s.id = a.chunk_id
             WHERE a.course_id = (SELECT id FROM courses WHERE id = ? AND instructor_id = ?)
             ORDER BY s.position
            """,
            (course_id, instructor_id),
        )
    )


# --- college view -----------------------------------------------------------
# Aggregates only. No display names, no student hashes leave these functions.


def term_totals(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    return _rows(
        connection.execute(
            """
            SELECT c.term, MIN(c.term_label) AS term_label, MIN(c.starts_on) AS starts_on,
                   COUNT(DISTINCT c.id) AS courses,
                   (SELECT COUNT(*) FROM enrollments en
                      JOIN courses c2 ON c2.id = en.course_id
                     WHERE c2.term = c.term) AS students_enrolled,
                   (SELECT COUNT(DISTINCT e.student_hash) FROM events e WHERE e.term = c.term) AS students_active,
                   (SELECT COUNT(DISTINCT json_extract(e.chunk_ids, '$[0]')) FROM events e
                     WHERE e.term = c.term AND e.verb = 'opened') AS sections_opened,
                   (SELECT COUNT(DISTINCT json_extract(e.chunk_ids, '$[0]')) FROM events e
                     WHERE e.term = c.term AND e.verb = 'read') AS sections_finished,
                   (SELECT COALESCE(SUM(COALESCE(json_extract(e.payload, '$.seconds'), 0)), 0)
                      FROM events e WHERE e.term = c.term AND e.verb = 'dwelled') AS dwell_seconds,
                   (SELECT COALESCE(SUM(ps.fee_cents * (
                             SELECT COUNT(*) FROM enrollments en WHERE en.course_id = ps.course_id
                           )), 0)
                      FROM prior_spend ps
                      JOIN courses c3 ON c3.id = ps.course_id
                     WHERE c3.term = c.term) AS displaced_cents
              FROM courses c
             GROUP BY c.term
             ORDER BY starts_on
            """
        )
    )


def course_totals(connection: sqlite3.Connection, term: str) -> list[dict[str, Any]]:
    return _rows(
        connection.execute(
            """
            SELECT c.id AS course_id, c.code, c.title, c.term, c.term_label, c.book_id,
                   p.display_name AS instructor,
                   (SELECT COUNT(*) FROM enrollments en WHERE en.course_id = c.id) AS enrolled,
                   (SELECT COUNT(DISTINCT e.student_hash) FROM events e WHERE e.course_id = c.id) AS students_active,
                   (SELECT COUNT(DISTINCT json_extract(e.chunk_ids, '$[0]')) FROM events e
                     WHERE e.course_id = c.id AND e.verb = 'opened') AS sections_opened,
                   (SELECT COALESCE(SUM(COALESCE(json_extract(e.payload, '$.seconds'), 0)), 0)
                      FROM events e WHERE e.course_id = c.id AND e.verb = 'dwelled') AS dwell_seconds,
                   ps.provider,
                   ps.fee_cents,
                   COALESCE(ps.fee_cents, 0) * (SELECT COUNT(*) FROM enrollments en WHERE en.course_id = c.id) AS displaced_cents
              FROM courses c
              JOIN people p ON p.id = c.instructor_id
              LEFT JOIN prior_spend ps ON ps.course_id = c.id
             WHERE c.term = ?
             ORDER BY c.code
            """,
            (term,),
        )
    )


def sections_live(connection: sqlite3.Connection, term: str) -> int:
    row = connection.execute(
        """
        SELECT COUNT(*) FROM sections
         WHERE tombstoned = 0
           AND book_id IN (SELECT DISTINCT book_id FROM courses WHERE term = ?)
        """,
        (term,),
    ).fetchone()
    return int(row[0])


def prior_spend_meta(seed_dir: Path | None) -> dict[str, Any]:
    """Whether the fee figures have been checked against a real contract."""
    if seed_dir:
        path = Path(seed_dir) / "prior-spend.json"
        if path.is_file():
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                return {"verified": bool(payload.get("verified", False)), "currency": payload.get("currency", "USD")}
            except (OSError, json.JSONDecodeError):
                pass
    return {"verified": False, "currency": "USD"}


def elapsed_days(starts_on: str, today: date | None = None) -> int:
    today = today or datetime.now(timezone.utc).date()
    try:
        start = date.fromisoformat(starts_on)
    except ValueError:
        return 0
    return max(0, (today - start).days)
