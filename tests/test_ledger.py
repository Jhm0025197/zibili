from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pymupdf

from ingest import ingest_paths
from ledger import InvalidEvent, student_hash, validate_batch
from library import Database

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SEED_DIR = PROJECT_ROOT / "seed"


def write_outline_pdf(path: Path, title: str) -> None:
    document = pymupdf.open()
    for number in range(8):
        page = document.new_page()
        page.insert_text((72, 72), " ".join(f"word{i}" for i in range(60)) + f" page {number + 1}")
    document.set_metadata({"title": title, "author": "Test"})
    document.set_toc(
        [
            [1, "Chapter 1 Alpha", 1],
            [2, "1.1 One", 1],
            [2, "1.2 Two", 2],
            [2, "Summary", 3],
            [1, "Chapter 2 Beta", 4],
            [2, "2.1 Three", 4],
            [1, "Chapter 6 Later", 6],
            [2, "6.1 Not assigned", 6],
        ]
    )
    document.save(path)
    document.close()


class SeedTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.db_path = self.root / "zibili.db"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def test_seeds_people_on_first_run(self) -> None:
        Database(str(self.db_path), seed_dir=SEED_DIR)
        connection = self.connect()
        try:
            people = connection.execute("SELECT id, role, student_hash FROM people").fetchall()
            enrollments = connection.execute("SELECT COUNT(*) FROM enrollments").fetchone()[0]
            salt = connection.execute("SELECT value FROM app_meta WHERE key = 'student_hash_salt'").fetchone()[0]
            spend = connection.execute("SELECT COUNT(*) FROM prior_spend").fetchone()[0]
            assignments = connection.execute("SELECT COUNT(*) FROM assignments").fetchone()[0]
            events = connection.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        finally:
            connection.close()
        self.assertEqual(len(people), 27)
        students = [p for p in people if p["role"] == "student"]
        self.assertEqual(len(students), 25)
        for student in students:
            self.assertEqual(len(student["student_hash"]), 32)
            self.assertNotIn(student["id"], student["student_hash"])
        self.assertEqual(enrollments, 50)
        self.assertEqual(len(salt), 64)
        self.assertEqual(spend, 2)
        # The seed book is not ingested here, so nothing is assigned or read yet.
        self.assertEqual(assignments, 0)
        self.assertEqual(events, 0)

    def test_second_initialise_does_not_duplicate(self) -> None:
        Database(str(self.db_path), seed_dir=SEED_DIR)
        Database(str(self.db_path), seed_dir=SEED_DIR)
        connection = self.connect()
        try:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM people").fetchone()[0], 27)
        finally:
            connection.close()

    def test_no_seed_dir_means_empty_ledger(self) -> None:
        Database(str(self.db_path))
        connection = self.connect()
        try:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM people").fetchone()[0], 0)
        finally:
            connection.close()

    def test_hash_is_stable_and_salted(self) -> None:
        Database(str(self.db_path))
        connection = self.connect()
        try:
            first = student_hash(connection, "stu-cho")
            second = student_hash(connection, "stu-cho")
            other = student_hash(connection, "stu-abara")
        finally:
            connection.close()
        self.assertEqual(first, second)
        self.assertNotEqual(first, other)
        self.assertEqual(len(first), 32)

    def test_course_content_seeds_after_book_sections_exist(self) -> None:
        seed_dir = self.root / "seed"
        seed_dir.mkdir()
        course = json.loads((SEED_DIR / "course.json").read_text(encoding="utf-8"))
        course["book_id"] = "seed-book"
        (seed_dir / "course.json").write_text(json.dumps(course), encoding="utf-8")
        for name in ("students.json", "prior-spend.json"):
            (seed_dir / name).write_bytes((SEED_DIR / name).read_bytes())
        pdf = self.root / "seed-book.pdf"
        write_outline_pdf(pdf, "Seed Book")

        Database(str(self.db_path), seed_dir=seed_dir)
        ingest_paths(
            [pdf],
            db_path=self.db_path,
            files_dir=self.root / "files",
            linearize=False,
            id_map_path=self.root / "id-map.json",
            seed_dir=seed_dir,
        )
        connection = self.connect()
        try:
            assigned = connection.execute(
                "SELECT course_id, chunk_id FROM assignments ORDER BY course_id, chunk_id"
            ).fetchall()
            counts = dict(
                connection.execute("SELECT term, COUNT(*) FROM events GROUP BY term").fetchall()
            )
            seeded = connection.execute("SELECT COUNT(*) FROM events WHERE seeded = 0").fetchone()[0]
            leaked = connection.execute("SELECT COUNT(*) FROM events WHERE student_hash LIKE 'stu-%'").fetchone()[0]
            verbs = {row[0] for row in connection.execute("SELECT DISTINCT verb FROM events")}
        finally:
            connection.close()
        # Only the numbered sections of chapters 1-5: 1.1, 1.2 and 2.1, per course.
        self.assertEqual(
            sorted({row["chunk_id"] for row in assigned}),
            ["seed-book-ch01-s01", "seed-book-ch01-s02", "seed-book-ch02-s01"],
        )
        self.assertEqual(len(assigned), 6)
        self.assertGreater(counts.get("2026SP", 0), 100)
        self.assertNotIn("2026FA", counts)
        self.assertEqual(seeded, 0)
        self.assertEqual(leaked, 0)
        self.assertEqual(verbs, {"opened", "dwelled", "read", "reread"})

        # Deterministic: a second database tells the same story.
        other_db = self.root / "other.db"
        Database(str(other_db), seed_dir=seed_dir)
        ingest_paths(
            [pdf],
            db_path=other_db,
            files_dir=self.root / "files2",
            linearize=False,
            id_map_path=self.root / "id-map2.json",
            seed_dir=seed_dir,
        )
        connection = sqlite3.connect(other_db)
        try:
            again = connection.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        finally:
            connection.close()
        self.assertEqual(again, sum(counts.values()))


class ValidateTests(unittest.TestCase):
    def good(self) -> dict:
        return {
            "events": [
                {"verb": "opened", "book_id": "book", "chunk_ids": ["book-ch01-s01"], "payload": {"page": 3}},
            ]
        }

    def test_accepts_good_batch(self) -> None:
        events = validate_batch(self.good())
        self.assertEqual(events[0].verb, "opened")
        self.assertEqual(events[0].payload, {"page": 3})
        self.assertIsNone(events[0].render_id)

    def test_rejects_bad_batches(self) -> None:
        cases = {
            "unknown verb": {"events": [{"verb": "skimmed", "book_id": "book", "chunk_ids": ["a"]}]},
            "empty chunk ids": {"events": [{"verb": "opened", "book_id": "book", "chunk_ids": []}]},
            "bad chunk id": {"events": [{"verb": "opened", "book_id": "book", "chunk_ids": ["Bad Id"]}]},
            "not an object": {"events": ["opened"]},
            "empty": {"events": []},
            "too many": {"events": [{"verb": "opened", "book_id": "b", "chunk_ids": ["a"]}] * 101},
            "payload too big": {
                "events": [{"verb": "opened", "book_id": "b", "chunk_ids": ["a"], "payload": {"x": "y" * 5000}}]
            },
            "occurred_at far away": {
                "events": [
                    {
                        "verb": "opened",
                        "book_id": "b",
                        "chunk_ids": ["a"],
                        "occurred_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
                    }
                ]
            },
            "occurred_at not a date": {
                "events": [{"verb": "opened", "book_id": "b", "chunk_ids": ["a"], "occurred_at": "yesterday"}]
            },
            "not a dict": ["events"],
        }
        for name, body in cases.items():
            with self.subTest(name):
                with self.assertRaises(InvalidEvent):
                    validate_batch(body)


if __name__ == "__main__":
    unittest.main()
