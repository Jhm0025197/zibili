from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

import pymupdf

from ingest import ingest_paths
from library import Database


def write_pdf(path: Path, title: str, lines: list[str]) -> None:
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((72, 72), "\n".join(lines))
    document.set_metadata({"title": title, "author": "Test Author"})
    document.save(path)
    document.close()


class IngestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.db_path = self.root / "zibili.db"
        self.files_dir = self.root / "files"
        self.pdf = self.root / "intro.pdf"
        write_pdf(self.pdf, "Test Philosophy", ["Hello Socrates", "CC BY-NC-SA 4.0"])
        self.pdf.with_suffix(".json").write_text(
            '{"course_codes":["PHI1010"],"subjects":["Philosophy"]}',
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_ingest_is_idempotent(self) -> None:
        first = ingest_paths(
            [self.pdf], db_path=self.db_path, files_dir=self.files_dir, linearize=False
        )
        second = ingest_paths(
            [self.pdf], db_path=self.db_path, files_dir=self.files_dir, linearize=False
        )
        self.assertEqual(first["added"], 1)
        self.assertEqual(second["skipped"], 1)
        connection = sqlite3.connect(self.db_path)
        try:
            row = connection.execute(
                "SELECT id, title, page_count, course_codes FROM books"
            ).fetchone()
        finally:
            connection.close()
        self.assertEqual(row[0], "test-philosophy")
        self.assertEqual(row[1], "Test Philosophy")
        self.assertEqual(row[2], 1)
        self.assertIn("PHI1010", row[3])
        self.assertTrue((self.files_dir / "test-philosophy.pdf").is_file())

    def test_schema_initializes(self) -> None:
        database = Database(str(self.db_path))
        connection = database.connect()
        try:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
        finally:
            connection.close()
        self.assertEqual(version, 1)


if __name__ == "__main__":
    unittest.main()
