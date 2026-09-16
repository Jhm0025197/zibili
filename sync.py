"""Sync people, sections and enrollments from Banner (via Ethos) into Zibili.

    python sync.py fixtures fixtures/ethos              # the shipped synthetic set
    python sync.py ethos --term 202680                  # live, needs ETHOS_API_KEY
    python sync.py ethos --dry-run                      # fetch and report, write nothing

What it writes, idempotently:

- ``people``: every instructor and registrant, keyed by Ethos person id,
  with the Banner ID and email alongside. Students get a salted hash like
  everyone else; the hash is what the ledger sees.
- ``courses``: one row per section (CRN), with subject, number, section
  number, term, primary instructor, and the books matched from the sidecar
  ``course_codes`` (PHI1010 matches subject PHI number 1010).
- ``course_books``: the section-to-book mapping.
- ``enrollments``: active registrations. A registration that disappears or
  reads not-registered becomes ``dropped``; nothing is deleted, so history
  in the ledger keeps its context.

Seeded rows are never touched: the sync only edits what it created.
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any

from ethos import Bundle, EthosClient, EthosError, FixtureSource
from ledger import iso, student_hash, utc_now
from library import Database, default_db_path, default_seed_dir, slugify

LOGGER = logging.getLogger("zibili.sync")
SOURCE = "ethos"
CODE_RE = re.compile(r"[^A-Z0-9]+")


def normalize_code(*parts: str) -> str:
    return CODE_RE.sub("", "".join(str(p) for p in parts).upper())


def term_label(term: dict[str, Any]) -> str:
    return term.get("title") or term.get("code") or "Term"


def book_index(connection: sqlite3.Connection) -> dict[str, list[str]]:
    """Normalised course code -> book ids, from the sidecar course_codes."""
    index: dict[str, list[str]] = {}
    for row in connection.execute("SELECT id, course_codes FROM books"):
        import json

        try:
            codes = json.loads(row["course_codes"] or "[]")
        except json.JSONDecodeError:
            codes = []
        for code in codes:
            index.setdefault(normalize_code(code), []).append(row["id"])
    return index


def course_id_for(section: dict[str, Any], course: dict[str, Any], term: dict[str, Any]) -> str:
    base = slugify(f"{course.get('subject', '')}{course.get('number', '')}-{section.get('section_number') or section.get('crn')}-{term.get('code', '')}")
    return base or f"crn-{section['crn']}"


def apply_bundle(connection: sqlite3.Connection, bundle: Bundle, *, dry_run: bool = False) -> dict[str, int]:
    now = iso(utc_now())
    counts = {"people": 0, "courses": 0, "enrollments": 0, "dropped": 0, "books_attached": 0, "skipped_sections": 0}
    books = book_index(connection)

    teaching = {row["person_id"] for row in bundle.instructors}
    registered = {row["person_id"] for row in bundle.registrations}
    hashes: dict[str, str] = {}

    # People first, so courses and enrollments can reference them.
    for person_id in sorted(teaching | registered):
        person = bundle.persons.get(person_id)
        if person is None:
            LOGGER.warning("person %s referenced but not in the bundle; skipping", person_id)
            continue
        role = "instructor" if person_id in teaching else "student"
        digest = student_hash(connection, person_id) if role == "student" else None
        if digest:
            hashes[person_id] = digest
        existing = connection.execute("SELECT id, role FROM people WHERE id = ?", (person_id,)).fetchone()
        if existing is None:
            if not dry_run:
                connection.execute(
                    """
                    INSERT INTO people (id, role, display_name, student_hash, created_at, external_id, email, source, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (person_id, role, person["name"] or person_id, digest, now, person["banner_id"], person["email"], SOURCE, now),
                )
        elif not dry_run:
            connection.execute(
                """
                UPDATE people SET role = ?, display_name = ?, student_hash = COALESCE(student_hash, ?),
                       external_id = ?, email = ?, updated_at = ?
                 WHERE id = ? AND source = ?
                """,
                (role, person["name"] or person_id, digest, person["banner_id"], person["email"], now, person_id, SOURCE),
            )
            row = connection.execute("SELECT student_hash FROM people WHERE id = ?", (person_id,)).fetchone()
            if row and row["student_hash"]:
                hashes[person_id] = row["student_hash"]
        counts["people"] += 1

    # Sections become courses.
    primary_for: dict[str, str] = {}
    for row in bundle.instructors:
        current = primary_for.get(row["section_id"])
        if current is None or row["primary"]:
            primary_for[row["section_id"]] = row["person_id"]

    section_course_ids: dict[str, str] = {}
    for section_id, section in sorted(bundle.sections.items(), key=lambda kv: kv[1]["crn"]):
        course = bundle.courses.get(section["course_id"] or "")
        term = bundle.terms.get(section["term_id"] or "")
        instructor = primary_for.get(section_id)
        if course is None or term is None or instructor is None or instructor not in bundle.persons:
            counts["skipped_sections"] += 1
            LOGGER.warning("section %s (CRN %s) skipped: missing course, term or instructor", section_id, section["crn"])
            continue
        existing = connection.execute("SELECT id FROM courses WHERE external_id = ?", (section_id,)).fetchone()
        course_id = existing["id"] if existing else course_id_for(section, course, term)
        if not existing:
            clash = connection.execute("SELECT 1 FROM courses WHERE id = ?", (course_id,)).fetchone()
            if clash:
                course_id = f"{course_id}-{section['crn']}"
        matched = books.get(normalize_code(course["subject"], course["number"]), [])
        code = f"{course['subject']} {course['number']}".strip()
        title = course["title"] or section["title"] or code
        if not dry_run:
            if existing:
                connection.execute(
                    """
                    UPDATE courses SET code = ?, title = ?, term = ?, term_label = ?, starts_on = ?, instructor_id = ?,
                           book_id = ?, crn = ?, subject = ?, number = ?, section_number = ?
                     WHERE id = ? AND source = ?
                    """,
                    (code, title, term["code"], term_label(term), section["starts_on"] or term["starts_on"], instructor,
                     matched[0] if matched else "", section["crn"], course["subject"], course["number"], section["section_number"],
                     course_id, SOURCE),
                )
            else:
                connection.execute(
                    """
                    INSERT INTO courses (id, code, title, term, term_label, starts_on, instructor_id, book_id, created_at,
                                         crn, subject, number, section_number, external_id, source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (course_id, code, title, term["code"], term_label(term), section["starts_on"] or term["starts_on"], instructor,
                     matched[0] if matched else "", now, section["crn"], course["subject"], course["number"],
                     section["section_number"], section_id, SOURCE),
                )
            connection.execute("DELETE FROM course_books WHERE course_id = ?", (course_id,))
            connection.executemany(
                "INSERT OR IGNORE INTO course_books (course_id, book_id) VALUES (?, ?)",
                [(course_id, book_id) for book_id in matched],
            )
        counts["courses"] += 1
        counts["books_attached"] += len(matched)
        section_course_ids[section_id] = course_id

    # Enrollments: active ones upserted, missing ones dropped.
    active_by_course: dict[str, set[str]] = {cid: set() for cid in section_course_ids.values()}
    for row in bundle.registrations:
        course_id = section_course_ids.get(row["section_id"])
        digest = hashes.get(row["person_id"])
        if course_id is None or digest is None:
            continue
        if row["active"]:
            active_by_course[course_id].add(digest)
    for course_id, digests in active_by_course.items():
        for digest in sorted(digests):
            if not dry_run:
                connection.execute(
                    """
                    INSERT INTO enrollments (course_id, student_hash, enrolled_at, status, source, updated_at)
                    VALUES (?, ?, ?, 'active', ?, ?)
                    ON CONFLICT (course_id, student_hash) DO UPDATE SET
                        status = 'active', updated_at = excluded.updated_at
                    """,
                    (course_id, digest, now, SOURCE, now),
                )
            counts["enrollments"] += 1
        if digests:
            marks = ",".join("?" for _ in digests)
            dropped = connection.execute(
                f"SELECT COUNT(*) FROM enrollments WHERE course_id = ? AND source = ? AND status = 'active' AND student_hash NOT IN ({marks})",
                (course_id, SOURCE, *sorted(digests)),
            ).fetchone()[0]
        else:
            dropped = connection.execute(
                "SELECT COUNT(*) FROM enrollments WHERE course_id = ? AND source = ? AND status = 'active'", (course_id, SOURCE)
            ).fetchone()[0]
        counts["dropped"] += int(dropped)
        if not dry_run:
            if digests:
                connection.execute(
                    f"UPDATE enrollments SET status = 'dropped', updated_at = ? WHERE course_id = ? AND source = ? AND status = 'active' AND student_hash NOT IN ({marks})",
                    (now, course_id, SOURCE, *sorted(digests)),
                )
            else:
                connection.execute(
                    "UPDATE enrollments SET status = 'dropped', updated_at = ? WHERE course_id = ? AND source = ? AND status = 'active'",
                    (now, course_id, SOURCE),
                )
    return counts


def run(source: Any, db_path: Path, *, term_codes: list[str] | None, dry_run: bool, seed_dir: Path | None) -> dict[str, int]:
    bundle = source.bundle(term_codes)
    database = Database(str(db_path), seed_dir=seed_dir)
    connection = database.connect()
    try:
        with database.transaction(connection):
            counts = apply_bundle(connection, bundle, dry_run=dry_run)
            if not dry_run:
                database.bump_revision(connection)
    finally:
        connection.close()
    return counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Sync Banner sections and enrollments into Zibili")
    sub = parser.add_subparsers(dest="source", required=True)
    fixtures = sub.add_parser("fixtures", help="read Ethos-shaped JSON files from a folder")
    fixtures.add_argument("folder")
    ethos = sub.add_parser("ethos", help="call the Ellucian Ethos Integration API")
    ethos.add_argument("--api-key", default=os.environ.get("ETHOS_API_KEY", ""))
    ethos.add_argument("--base-url", default=os.environ.get("ETHOS_BASE_URL", "https://integrate.elluciancloud.com"))
    for p in (fixtures, ethos):
        p.add_argument("--term", action="append", dest="terms", help="term code to sync (repeatable); default: every term in the source")
        p.add_argument("--db", default=str(default_db_path()))
        p.add_argument("--seed-dir", default=str(default_seed_dir()))
        p.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    try:
        source = FixtureSource(args.folder) if args.source == "fixtures" else EthosClient(args.api_key, args.base_url)
        counts = run(source, Path(args.db), term_codes=args.terms, dry_run=args.dry_run, seed_dir=Path(args.seed_dir))
    except EthosError as exc:
        print(f"sync failed: {exc}", file=sys.stderr)
        return 1
    verb = "would write" if args.dry_run else "wrote"
    print(
        f"{verb} {counts['people']} people, {counts['courses']} sections ({counts['books_attached']} book attachments), "
        f"{counts['enrollments']} active enrollments; {counts['dropped']} dropped; {counts['skipped_sections']} sections skipped"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
