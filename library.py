"""Catalog schema and helpers shared by ingest and the HTTP server."""

from __future__ import annotations

import contextlib
import json
import logging
import re
import secrets
import sqlite3
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

LOGGER = logging.getLogger("zibili.db")

SCHEMA_VERSION = 2
APP_VERSION = "0.2.0"

BOOK_SELECT = """
id, sha256, title, author, publisher, released, language, isbn13, description,
quote, subjects, lists, course_codes, audience, color, license, page_count,
file_path, file_size, linearized, ingested_at
"""

SLUG_RE = re.compile(r"[^a-z0-9]+")
BOOK_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def slugify(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text or "")
    stripped = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    slug = SLUG_RE.sub("-", stripped.lower()).strip("-")
    return slug[:80] or "book"


def default_db_path() -> Path:
    return Path(__file__).resolve().parent / "data" / "zibili.db"


def default_files_dir() -> Path:
    return Path(__file__).resolve().parent / "data" / "files"


def default_books_dir() -> Path:
    return Path(__file__).resolve().parent / "books"


def default_seed_dir() -> Path:
    return Path(__file__).resolve().parent / "seed"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    publisher TEXT,
    released TEXT,
    language TEXT NOT NULL DEFAULT 'English',
    isbn13 TEXT,
    description TEXT NOT NULL DEFAULT '',
    quote TEXT,
    subjects TEXT NOT NULL DEFAULT '[]',
    lists TEXT NOT NULL DEFAULT '["new","available","popular"]',
    course_codes TEXT NOT NULL DEFAULT '[]',
    audience TEXT NOT NULL DEFAULT 'adults',
    color TEXT NOT NULL DEFAULT '#194257',
    license TEXT,
    page_count INTEGER NOT NULL,
    cover_png BLOB,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    linearized INTEGER NOT NULL DEFAULT 0,
    ingested_at TEXT NOT NULL
);

-- One row per section of the PDF outline. IDs are permanent: see ingest.py
-- and books/id-map.json. Pages are 1-based physical indices, the numbers
-- PDF.js uses.
CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    section INTEGER NOT NULL,
    number TEXT,
    title TEXT NOT NULL,
    chapter_title TEXT NOT NULL,
    start_page INTEGER NOT NULL,
    end_page INTEGER NOT NULL,
    words INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL,
    tombstoned INTEGER NOT NULL DEFAULT 0,
    UNIQUE (book_id, chapter, section)
);
CREATE INDEX IF NOT EXISTS sections_book_page ON sections (book_id, start_page);

-- Ledger. Written for SQLite, shaped for Postgres. `student_hash` is the only
-- student identifier that ever reaches `events`; the hash -> name mapping
-- lives in `people` and is only joined by instructor-scoped queries.
CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('student', 'instructor', 'admin')),
    display_name TEXT NOT NULL,
    student_hash TEXT UNIQUE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    term TEXT NOT NULL,
    term_label TEXT NOT NULL,
    starts_on TEXT NOT NULL,
    instructor_id TEXT NOT NULL REFERENCES people (id),
    book_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enrollments (
    course_id TEXT NOT NULL REFERENCES courses (id),
    student_hash TEXT NOT NULL,
    enrolled_at TEXT NOT NULL,
    PRIMARY KEY (course_id, student_hash)
);
CREATE TABLE IF NOT EXISTS assignments (
    course_id TEXT NOT NULL REFERENCES courses (id),
    chunk_id TEXT NOT NULL,
    due_at TEXT,
    assigned_at TEXT NOT NULL,
    PRIMARY KEY (course_id, chunk_id)
);
CREATE TABLE IF NOT EXISTS prior_spend (
    course_id TEXT PRIMARY KEY REFERENCES courses (id),
    provider TEXT NOT NULL,
    fee_cents INTEGER NOT NULL,
    note TEXT
);
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    student_hash TEXT NOT NULL,
    course_id TEXT NOT NULL,
    instructor_id TEXT NOT NULL,
    term TEXT NOT NULL,
    book_id TEXT NOT NULL,
    chunk_ids TEXT NOT NULL,
    render_id TEXT,
    verb TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    occurred_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    seeded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS events_course_time ON events (course_id, occurred_at);
CREATE INDEX IF NOT EXISTS events_student_time ON events (student_hash, occurred_at);
CREATE INDEX IF NOT EXISTS events_verb ON events (course_id, verb);
CREATE TABLE IF NOT EXISTS positions (
    student_hash TEXT NOT NULL,
    book_id TEXT NOT NULL,
    page INTEGER NOT NULL,
    section_id TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (student_hash, book_id)
);
"""


class Database:
    """One SQLite file. `seed_dir` (a folder with course.json) enables seeding
    on first run; tests pass None to get an empty ledger."""

    def __init__(self, path: str, seed_dir: Path | None = None) -> None:
        self.path = path
        self.seed_dir = Path(seed_dir) if seed_dir else None
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.path,
            timeout=5.0,
            isolation_level=None,
            check_same_thread=False,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        connection.execute("PRAGMA synchronous = NORMAL")
        return connection

    def initialize(self) -> None:
        if self.path != ":memory:":
            Path(self.path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        connection = self.connect()
        try:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(SCHEMA_SQL)
            connection.execute(
                "INSERT OR IGNORE INTO app_meta(key, value) VALUES ('revision', '0')"
            )
            connection.execute(
                "INSERT OR IGNORE INTO app_meta(key, value) VALUES ('student_hash_salt', ?)",
                (secrets.token_hex(32),),
            )
            probe = connection.execute("SELECT json_extract('{\"a\":1}', '$.a')").fetchone()[0]
            if probe != 1:
                raise RuntimeError(
                    "This Python's SQLite lacks JSON functions. Zibili needs SQLite 3.38 or newer."
                )
            connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
            self.seed(connection)
        finally:
            connection.close()

    def seed(self, connection: sqlite3.Connection) -> dict[str, int]:
        """Fill in whatever seed data is still missing. Safe to call often."""
        if self.seed_dir is None:
            return {"people": 0, "courses": 0, "events": 0}
        from seed import ensure  # local import: seed.py imports ledger.py, which needs nothing from here

        with self.transaction(connection):
            return ensure(connection, self.seed_dir)

    @contextlib.contextmanager
    def transaction(self, connection: sqlite3.Connection) -> Iterator[None]:
        connection.execute("BEGIN IMMEDIATE")
        try:
            yield
        except BaseException:
            connection.execute("ROLLBACK")
            raise
        else:
            connection.execute("COMMIT")

    @staticmethod
    def revision(connection: sqlite3.Connection) -> int:
        row = connection.execute(
            "SELECT value FROM app_meta WHERE key = 'revision'"
        ).fetchone()
        return int(row["value"] if row else 0)

    @staticmethod
    def bump_revision(connection: sqlite3.Connection) -> int:
        connection.execute(
            "UPDATE app_meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'revision'"
        )
        return Database.revision(connection)


def _json_list(value: str | None) -> list[Any]:
    try:
        parsed = json.loads(value or "[]")
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def book_to_json(row: sqlite3.Row) -> dict[str, Any]:
    book_id = row["id"]
    return {
        "id": book_id,
        "title": row["title"],
        "author": row["author"],
        "isbn13": row["isbn13"] or "",
        "cover": f"/api/books/{book_id}/cover",
        "color": row["color"] or "#194257",
        "audience": row["audience"] or "adults",
        "lists": _json_list(row["lists"]),
        "description": row["description"] or "",
        "quote": row["quote"] or "",
        "subjects": _json_list(row["subjects"]),
        "publisher": row["publisher"] or "",
        "released": row["released"] or "",
        "pages": row["page_count"],
        "language": row["language"] or "English",
        "similar": [],
        "pdf": f"/api/books/{book_id}/file",
        "license": row["license"] or "",
        "course_codes": _json_list(row["course_codes"]),
        "ingested_at": row["ingested_at"],
    }


def list_books(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute(
        f"SELECT {BOOK_SELECT} FROM books ORDER BY title COLLATE NOCASE"
    ).fetchall()
    books = [book_to_json(row) for row in rows]
    ids = [book["id"] for book in books]
    for book in books:
        book["similar"] = [other for other in ids if other != book["id"]][:8]
    return books


def get_book(connection: sqlite3.Connection, book_id: str) -> sqlite3.Row | None:
    return connection.execute(
        f"SELECT {BOOK_SELECT} FROM books WHERE id = ?", (book_id,)
    ).fetchone()


def book_count(connection: sqlite3.Connection) -> int:
    row = connection.execute("SELECT COUNT(*) AS n FROM books").fetchone()
    return int(row["n"] if row else 0)


def list_sections(connection: sqlite3.Connection, book_id: str) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT id, book_id, chapter, section, number, title, chapter_title,
               start_page, end_page, words, position, tombstoned
        FROM sections WHERE book_id = ? ORDER BY position
        """,
        (book_id,),
    ).fetchall()


def sections_to_json(connection: sqlite3.Connection, book_id: str) -> dict[str, Any]:
    rows = list_sections(connection, book_id)
    status_row = connection.execute(
        "SELECT value FROM app_meta WHERE key = ?", (f"outline:{book_id}",)
    ).fetchone()
    omitted_row = connection.execute(
        "SELECT value FROM app_meta WHERE key = ?", (f"outline_omitted:{book_id}",)
    ).fetchone()
    chapters: list[dict[str, Any]] = []
    by_chapter: dict[int, dict[str, Any]] = {}
    for row in rows:
        if row["tombstoned"]:
            continue
        chapter = by_chapter.get(row["chapter"])
        if chapter is None:
            chapter = {
                "id": f"ch{row['chapter']:02d}",
                "number": row["chapter"],
                "title": row["chapter_title"],
                "start_page": row["start_page"],
                "sections": [],
            }
            by_chapter[row["chapter"]] = chapter
            chapters.append(chapter)
        chapter["sections"].append(
            {
                "id": row["id"],
                "number": row["number"],
                "title": row["title"],
                "start_page": row["start_page"],
                "end_page": row["end_page"],
                "words": row["words"],
            }
        )
    return {
        "book_id": book_id,
        "outline": status_row["value"] if status_row else ("ok" if rows else "none"),
        "chapters": chapters,
        "omitted": _json_list(omitted_row["value"] if omitted_row else "[]"),
    }
