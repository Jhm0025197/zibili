"""Catalog schema and helpers shared by ingest and the HTTP server."""

from __future__ import annotations

import contextlib
import json
import re
import sqlite3
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

SCHEMA_VERSION = 1
APP_VERSION = "0.1.0"

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


class Database:
    def __init__(self, path: str) -> None:
        self.path = path
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
            connection.executescript(
                """
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
                """
            )
            connection.execute(
                "INSERT OR IGNORE INTO app_meta(key, value) VALUES ('revision', '0')"
            )
            connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        finally:
            connection.close()

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
