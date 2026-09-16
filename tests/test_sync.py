from __future__ import annotations

import http.client
import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path

import pymupdf

from ethos import FixtureSource, normalize
from ingest import ingest_paths
from library import Database
from queries import course_for_book, courses_for_instructor, courses_for_student, roster
from server import AppConfig, create_server
from sync import apply_bundle, run

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = PROJECT_ROOT / "fixtures" / "ethos"


def write_book(path: Path, title: str, course_code: str) -> None:
    document = pymupdf.open()
    for number in range(4):
        page = document.new_page()
        page.insert_text((72, 72), f"{title} page {number + 1} " + "word " * 40)
    document.set_metadata({"title": title, "author": "OpenStax"})
    document.set_toc([[1, "Chapter 1 One", 1], [2, "1.1 First", 1], [2, "1.2 Second", 3]])
    document.save(path)
    document.close()
    path.with_suffix(".json").write_text(json.dumps({"title": title, "course_codes": [course_code]}), encoding="utf-8")


def guid(seed: str) -> str:
    import uuid

    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"zibili-fixture/{seed}"))


class SyncedDatabase:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.db_path = root / "zibili.db"
        Database(str(self.db_path))  # no seed dir: the fixtures are the only people
        pdfs = []
        for title, code in (("Intro Philosophy", "PHI1010"), ("Business Law Basics", "BUL2241")):
            pdf = root / f"{code.lower()}.pdf"
            write_book(pdf, title, code)
            pdfs.append(pdf)
        ingest_paths(pdfs, db_path=self.db_path, files_dir=root / "files", linearize=False, id_map_path=root / "id-map.json")

    def sync(self, folder: Path = FIXTURES, terms=None, dry_run=False):
        return run(FixtureSource(folder), self.db_path, term_codes=terms, dry_run=dry_run, seed_dir=None)

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection


class NormalizeTests(unittest.TestCase):
    def test_fixture_bundle_shape(self) -> None:
        bundle = FixtureSource(FIXTURES).bundle()
        self.assertEqual(sorted(t["code"] for t in bundle.terms.values()), ["202680", "202710"])
        self.assertEqual(len(bundle.sections), 5)
        self.assertEqual(len(bundle.persons), 33)
        self.assertEqual(sum(1 for r in bundle.registrations if not r["active"]), 1)
        phi = next(c for c in bundle.courses.values() if c["number"] == "1010")
        self.assertEqual(phi["subject"], "PHI")
        self.assertEqual(phi["title"], "Introduction to Philosophy")
        reyes = bundle.persons[guid("instr/reyes")]
        self.assertEqual(reyes["name"], "Marisol Reyes")
        self.assertEqual(reyes["banner_id"], "A00100001")

    def test_restrict_to_terms(self) -> None:
        bundle = FixtureSource(FIXTURES).bundle(["202680"])
        self.assertEqual(len(bundle.sections), 4)
        self.assertTrue(all(r["section_id"] in bundle.sections for r in bundle.registrations))

    def test_normalize_tolerates_sparse_records(self) -> None:
        bundle = normalize({"sections": [{"id": "s1"}], "persons": [{"id": "p1"}], "academic-periods": [{"id": "t1", "code": "X"}]})
        self.assertEqual(bundle.sections["s1"]["crn"], "")
        self.assertEqual(bundle.persons["p1"]["name"], "")
        self.assertEqual(bundle.terms["t1"]["title"], "X")


class ApplyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.db = SyncedDatabase(Path(self.temporary.name))

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_sync_writes_people_sections_books_and_enrollments(self) -> None:
        counts = self.db.sync()
        self.assertEqual(counts["people"], 33)
        self.assertEqual(counts["courses"], 5)
        self.assertEqual(counts["skipped_sections"], 0)
        self.assertEqual(counts["books_attached"], 4)  # 3 PHI sections + 1 BUL; ENC has no book
        connection = self.db.connect()
        try:
            people = connection.execute("SELECT role, COUNT(*) AS n FROM people GROUP BY role").fetchall()
            self.assertEqual({r["role"]: r["n"] for r in people}, {"instructor": 3, "student": 30})
            leaked = connection.execute(
                "SELECT COUNT(*) FROM people WHERE role = 'student' AND (student_hash LIKE '%' || external_id || '%' OR LENGTH(student_hash) != 32)"
            ).fetchone()[0]
            self.assertEqual(leaked, 0)
            course = connection.execute("SELECT * FROM courses WHERE crn = '10001'").fetchone()
            self.assertEqual(course["id"], "phi1010-001-202680")
            self.assertEqual(course["code"], "PHI 1010")
            self.assertEqual(course["term"], "202680")
            self.assertEqual(course["term_label"], "Fall 2026")
            self.assertEqual(course["instructor_id"], guid("instr/reyes"))
            self.assertEqual(course["book_id"], "intro-philosophy")
            enc = connection.execute("SELECT book_id FROM courses WHERE crn = '10004'").fetchone()
            self.assertEqual(enc["book_id"], "")
            active = connection.execute("SELECT course_id, COUNT(*) AS n FROM enrollments WHERE status = 'active' GROUP BY course_id").fetchall()
            self.assertEqual({r["course_id"]: r["n"] for r in active}["phi1010-001-202680"], 15)
            dropped = connection.execute("SELECT COUNT(*) FROM enrollments WHERE status = 'dropped'").fetchone()[0]
            self.assertEqual(dropped, 0)  # the not-registered one was never active
        finally:
            connection.close()

    def test_second_sync_changes_nothing(self) -> None:
        self.db.sync()
        connection = self.db.connect()
        before = connection.execute("SELECT id, code, instructor_id, book_id FROM courses ORDER BY id").fetchall()
        hashes = connection.execute("SELECT id, student_hash FROM people ORDER BY id").fetchall()
        connection.close()
        counts = self.db.sync()
        connection = self.db.connect()
        try:
            after = connection.execute("SELECT id, code, instructor_id, book_id FROM courses ORDER BY id").fetchall()
            hashes_after = connection.execute("SELECT id, student_hash FROM people ORDER BY id").fetchall()
            total = connection.execute("SELECT COUNT(*) FROM enrollments").fetchone()[0]
        finally:
            connection.close()
        self.assertEqual([tuple(r) for r in before], [tuple(r) for r in after])
        self.assertEqual([tuple(r) for r in hashes], [tuple(r) for r in hashes_after])
        self.assertEqual(total, 82)
        self.assertEqual(counts["dropped"], 0)

    def test_dropped_registration_is_kept_but_inactive(self) -> None:
        self.db.sync()
        folder = Path(self.temporary.name) / "later"
        folder.mkdir()
        for path in FIXTURES.glob("*.json"):
            (folder / path.name).write_bytes(path.read_bytes())
        regs = json.loads((folder / "section-registrations.json").read_text(encoding="utf-8"))
        cho = guid("stu/cho")
        section = guid("sec/10001")
        regs = [r for r in regs if not (r["registrant"]["id"] == cho and r["section"]["id"] == section)]
        (folder / "section-registrations.json").write_text(json.dumps(regs), encoding="utf-8")
        counts = self.db.sync(folder)
        self.assertEqual(counts["dropped"], 1)
        connection = self.db.connect()
        try:
            cho_hash = connection.execute("SELECT student_hash FROM people WHERE id = ?", (cho,)).fetchone()[0]
            status = connection.execute(
                "SELECT status FROM enrollments WHERE course_id = 'phi1010-001-202680' AND student_hash = ?", (cho_hash,)
            ).fetchone()[0]
            self.assertEqual(status, "dropped")
            names = [r["display_name"] for r in roster(connection, "phi1010-001-202680", guid("instr/reyes"))]
            self.assertNotIn("Jiwon Cho", names)
            self.assertEqual(len(names), 14)
            student_courses = courses_for_student(connection, cho_hash)
            self.assertNotIn("phi1010-001-202680", [c["id"] for c in student_courses])
        finally:
            connection.close()

    def test_student_and_instructor_views(self) -> None:
        self.db.sync()
        connection = self.db.connect()
        try:
            abara = connection.execute("SELECT student_hash FROM people WHERE id = ?", (guid("stu/abara"),)).fetchone()[0]
            courses = courses_for_student(connection, abara)
            self.assertEqual([c["id"] for c in courses], ["phi1010-001-202710", "enc1101-001-202680", "phi1010-001-202680"])
            self.assertEqual([b["id"] for b in courses[2]["books"]], ["intro-philosophy"])
            self.assertEqual(courses[1]["books"], [])
            self.assertEqual(course_for_book(connection, abara, "intro-philosophy")["id"], "phi1010-001-202710")
            self.assertIsNone(course_for_book(connection, abara, "business-law-basics"))
            reyes = courses_for_instructor(connection, guid("instr/reyes"))
            self.assertEqual([c["id"] for c in reyes], ["phi1010-001-202710", "phi1010-001-202680", "phi1010-002-202680"])
            self.assertEqual(reyes[1]["enrolled"], 15)
            self.assertEqual(reyes[1]["crn"], "10001")
            self.assertEqual(reyes[1]["books"], 1)
            okonkwo = courses_for_instructor(connection, guid("instr/okonkwo"))
            self.assertEqual([c["crn"] for c in okonkwo], ["10003"])
        finally:
            connection.close()

    def test_dry_run_writes_nothing(self) -> None:
        counts = self.db.sync(dry_run=True)
        self.assertEqual(counts["courses"], 5)
        connection = self.db.connect()
        try:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM courses").fetchone()[0], 0)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM people").fetchone()[0], 0)
        finally:
            connection.close()

    def test_term_filter(self) -> None:
        counts = self.db.sync(terms=["202710"])
        self.assertEqual(counts["courses"], 1)


class SyncedRoutesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.db = SyncedDatabase(Path(self.temporary.name))
        self.db.sync()
        config = AppConfig(
            db_path=str(self.db.db_path),
            static_dir=PROJECT_ROOT,
            files_dir=Path(self.temporary.name) / "files",
            public_base_url="http://127.0.0.1",
        )
        self.server = create_server("127.0.0.1", 0, config)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temporary.cleanup()

    def call(self, method: str, path: str, person: str | None = None, body=None):
        headers = {"Cookie": f"zibili_person={person}"} if person else {}
        payload = None
        if body is not None:
            payload = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            connection.request(method, path, body=payload, headers=headers)
            response = connection.getresponse()
            return response.status, json.loads(response.read() or b"null")
        finally:
            connection.close()

    def test_student_courses_and_event_attribution(self) -> None:
        abara = guid("stu/abara")
        status, courses = self.call("GET", "/api/me/courses", abara)
        self.assertEqual(status, 200)
        self.assertEqual(len(courses), 3)
        self.assertEqual(courses[0]["term_label"], "Spring 2027")
        status, session = self.call("GET", "/api/session", abara)
        self.assertEqual(len(session["courses"]), 3)
        # Reading the business-law book, which Abara's sections do not use,
        # falls back to the latest section; the philosophy book lands on the
        # philosophy section.
        batch = {"events": [{"verb": "opened", "book_id": "intro-philosophy", "chunk_ids": ["intro-philosophy-ch01-s01"], "payload": {"page": 1}}]}
        self.assertEqual(self.call("POST", "/api/events", abara, batch)[0], 202)
        connection = self.db.connect()
        try:
            row = connection.execute("SELECT course_id, instructor_id FROM events").fetchone()
        finally:
            connection.close()
        self.assertEqual(row["course_id"], "phi1010-001-202710")
        self.assertEqual(row["instructor_id"], guid("instr/reyes"))
        status, _ = self.call("GET", "/api/me/courses")
        self.assertEqual(status, 401)

    def test_instructor_roster_from_sync(self) -> None:
        status, body = self.call("GET", "/api/instructor/roster?course=phi1010-002-202680", guid("instr/reyes"))
        self.assertEqual(status, 200)
        self.assertEqual(len(body["roster"]), 15)
        self.assertEqual([c["crn"] for c in body["courses"]], ["20001", "10001", "10002"])
        status, _ = self.call("GET", "/api/instructor/roster?course=bul2241-001-202680", guid("instr/reyes"))
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
