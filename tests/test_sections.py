from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import pymupdf

from ingest import ingest_paths
from sections import build_outline, load_id_map, save_id_map

TOC = [
    [1, "Contents", 1],
    [1, "Chapter 1 Alpha", 2],
    [2, "Chapter Outline", 2],
    [2, "1.1 One", 3],
    [2, "Summary", 4],
    [1, "Chapter 2 Beta", 5],
    [2, "2.1 Two", 5],
    [1, "Index", 6],
]


def write_pdf(path: Path, toc: list | None, pages: int = 6) -> None:
    document = pymupdf.open()
    for number in range(pages):
        page = document.new_page()
        page.insert_text((72, 72), f"Page {number + 1} words words words")
    document.set_metadata({"title": "Outline Book", "author": "Test"})
    if toc is not None:
        document.set_toc(toc)
    document.save(path)
    document.close()


class BuildOutlineTests(unittest.TestCase):
    def test_ids_pages_and_omitted(self) -> None:
        outline = build_outline(TOC, 6, "book", {"version": 1, "books": {}})
        self.assertEqual(outline.status, "ok")
        live = [s for s in outline.sections if not s.tombstoned]
        self.assertEqual([s.id for s in live], ["book-ch01-s02", "book-ch01-s01", "book-ch01-s03", "book-ch02-s01"])
        by_id = {s.id: s for s in live}
        self.assertEqual(by_id["book-ch01-s01"].number, "1.1")
        self.assertEqual(by_id["book-ch01-s01"].title, "One")
        self.assertIsNone(by_id["book-ch01-s03"].number)
        self.assertEqual(by_id["book-ch01-s03"].title, "Summary")
        self.assertEqual((by_id["book-ch01-s02"].start_page, by_id["book-ch01-s02"].end_page), (2, 2))
        self.assertEqual((by_id["book-ch01-s01"].start_page, by_id["book-ch01-s01"].end_page), (3, 3))
        self.assertEqual((by_id["book-ch01-s03"].start_page, by_id["book-ch01-s03"].end_page), (4, 4))
        self.assertEqual((by_id["book-ch02-s01"].start_page, by_id["book-ch02-s01"].end_page), (5, 5))
        self.assertEqual(outline.omitted, ["Contents", "Index"])
        self.assertEqual(outline.minted, 4)
        self.assertEqual([s.chapter_title for s in live][:1], ["Alpha"])

    def test_second_run_mints_nothing(self) -> None:
        id_map = {"version": 1, "books": {}}
        first = build_outline(TOC, 6, "book", id_map)
        before = json.dumps(id_map, sort_keys=True)
        second = build_outline(TOC, 6, "book", id_map)
        self.assertEqual(second.minted, 0)
        self.assertEqual(second.reused, 4)
        self.assertEqual(json.dumps(id_map, sort_keys=True), before)
        self.assertEqual([s.id for s in first.sections], [s.id for s in second.sections])

    def test_reorder_keeps_ids(self) -> None:
        id_map = {"version": 1, "books": {}}
        build_outline(TOC, 6, "book", id_map)
        reordered = [
            [1, "Chapter 1 Alpha", 2],
            [2, "1.1 One", 2],
            [2, "Chapter Outline", 3],
            [2, "Summary", 4],
            [1, "Chapter 2 Beta", 5],
            [2, "2.1 Two", 5],
        ]
        outline = build_outline(reordered, 6, "book", id_map)
        self.assertEqual(outline.minted, 0)
        ids = {s.title: s.id for s in outline.sections}
        self.assertEqual(ids["Chapter Outline"], "book-ch01-s02")
        self.assertEqual(ids["One"], "book-ch01-s01")

    def test_removed_section_is_tombstoned_and_number_not_reused(self) -> None:
        id_map = {"version": 1, "books": {}}
        build_outline(TOC, 6, "book", id_map)
        without = [e for e in TOC if e[1] != "2.1 Two"]
        outline = build_outline(without, 6, "book", id_map)
        self.assertEqual(outline.tombstoned, 1)
        tomb = [s for s in outline.sections if s.tombstoned]
        self.assertEqual([s.id for s in tomb], ["book-ch02-s01"])
        # Add a new unnumbered section to chapter 2: it must not take s01.
        added = without[:-1] + [[2, "Key Terms", 5]] + without[-1:]
        outline = build_outline(added, 6, "book", id_map)
        new = [s for s in outline.sections if s.title == "Key Terms"]
        self.assertEqual(new[0].id, "book-ch02-s02")
        self.assertEqual(outline.minted, 1)

    def test_printed_number_taken_by_earlier_id_gets_next_free(self) -> None:
        id_map = {"version": 1, "books": {}}
        build_outline([[1, "Chapter 1 Alpha", 1], [2, "Intro", 1]], 3, "book", id_map)
        outline = build_outline([[1, "Chapter 1 Alpha", 1], [2, "Intro", 1], [2, "1.1 One", 2]], 3, "book", id_map)
        ids = {s.title: s.id for s in outline.sections}
        self.assertEqual(ids["Intro"], "book-ch01-s01")
        self.assertEqual(ids["One"], "book-ch01-s02")

    def test_no_outline_falls_back_to_whole_book(self) -> None:
        outline = build_outline([], 9, "book", {"version": 1, "books": {}})
        self.assertEqual(outline.status, "none")
        self.assertEqual(len(outline.sections), 1)
        self.assertEqual(outline.sections[0].id, "book-ch01-s01")
        self.assertEqual((outline.sections[0].start_page, outline.sections[0].end_page), (1, 9))

    def test_flat_outline_gives_one_section_per_chapter(self) -> None:
        toc = [[1, "Chapter 1 Alpha", 1], [1, "Chapter 2 Beta", 4]]
        outline = build_outline(toc, 6, "book", {"version": 1, "books": {}})
        self.assertEqual(outline.status, "flat")
        self.assertEqual([s.id for s in outline.sections], ["book-ch01-s01", "book-ch02-s01"])
        self.assertEqual((outline.sections[0].start_page, outline.sections[0].end_page), (1, 3))
        self.assertEqual((outline.sections[1].start_page, outline.sections[1].end_page), (4, 6))

    def test_unnumbered_chapters_are_numbered_by_order(self) -> None:
        toc = [[1, "Preface", 1], [1, "Ethics", 2], [2, "What is good", 2], [1, "Logic", 4], [2, "Arguments", 4]]
        outline = build_outline(toc, 6, "book", {"version": 1, "books": {}})
        self.assertEqual(outline.status, "ok")
        self.assertEqual([s.id for s in outline.sections], ["book-ch02-s01", "book-ch03-s01"])


class IngestSectionsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.db_path = self.root / "zibili.db"
        self.files_dir = self.root / "files"
        self.id_map = self.root / "id-map.json"
        self.pdf = self.root / "outline.pdf"
        write_pdf(self.pdf, TOC)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def ingest(self, force: bool = False) -> dict[str, int]:
        return ingest_paths(
            [self.pdf],
            db_path=self.db_path,
            files_dir=self.files_dir,
            linearize=False,
            force=force,
            id_map_path=self.id_map,
        )

    def rows(self) -> list[tuple]:
        connection = sqlite3.connect(self.db_path)
        try:
            return connection.execute(
                "SELECT id, number, title, start_page, end_page, words, tombstoned FROM sections ORDER BY position"
            ).fetchall()
        finally:
            connection.close()

    def test_sections_written_and_stable(self) -> None:
        self.ingest()
        first = self.rows()
        self.assertEqual([r[0] for r in first], ["outline-book-ch01-s02", "outline-book-ch01-s01", "outline-book-ch01-s03", "outline-book-ch02-s01"])
        self.assertTrue(all(r[5] > 0 for r in first), first)
        map_bytes = self.id_map.read_bytes()

        stats = self.ingest()
        self.assertEqual(stats["skipped"], 1)
        self.assertEqual(self.id_map.read_bytes(), map_bytes)

        stats = self.ingest(force=True)
        self.assertEqual(stats["added"], 1)
        self.assertEqual(self.rows(), first)
        self.assertEqual(self.id_map.read_bytes(), map_bytes)

    def test_sections_backfilled_for_existing_book(self) -> None:
        self.ingest()
        connection = sqlite3.connect(self.db_path)
        connection.execute("DELETE FROM sections")
        connection.commit()
        connection.close()
        stats = self.ingest()
        self.assertEqual(stats["skipped"], 1)
        self.assertEqual(len(self.rows()), 4)

    def test_outline_status_recorded(self) -> None:
        write_pdf(self.pdf, None)
        self.ingest()
        connection = sqlite3.connect(self.db_path)
        try:
            status = connection.execute("SELECT value FROM app_meta WHERE key = 'outline:outline-book'").fetchone()[0]
        finally:
            connection.close()
        self.assertEqual(status, "none")
        self.assertEqual([r[0] for r in self.rows()], ["outline-book-ch01-s01"])

    def test_id_map_round_trip(self) -> None:
        self.ingest()
        loaded = load_id_map(self.id_map)
        self.assertIn("outline-book", loaded["books"])
        save_id_map(self.id_map, loaded)
        self.assertEqual(load_id_map(self.id_map), loaded)


if __name__ == "__main__":
    unittest.main()
