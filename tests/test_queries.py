from __future__ import annotations

import http.client
import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path

from ingest import ingest_paths
from library import Database
from queries import (
    assigned_sections,
    course_totals,
    courses_for_instructor,
    elapsed_days,
    roster,
    section_rollup,
    sections_live,
    student_name,
    student_trail,
    term_totals,
)
from server import AppConfig, create_server
from test_ledger import write_outline_pdf

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SEED_DIR = PROJECT_ROOT / "seed"
INSTRUCTOR = "instructor-reyes"
STUDENT_NAMES = [
    s["display_name"] for s in json.loads((SEED_DIR / "students.json").read_text(encoding="utf-8"))["students"]
]


def seeded_database(root: Path) -> tuple[Path, Path]:
    """A database with the seed course pointed at a small outlined test book."""
    seed_dir = root / "seed"
    seed_dir.mkdir()
    course = json.loads((SEED_DIR / "course.json").read_text(encoding="utf-8"))
    course["book_id"] = "seed-book"
    (seed_dir / "course.json").write_text(json.dumps(course), encoding="utf-8")
    for name in ("students.json", "prior-spend.json"):
        (seed_dir / name).write_bytes((SEED_DIR / name).read_bytes())
    pdf = root / "seed-book.pdf"
    write_outline_pdf(pdf, "Seed Book")
    db_path = root / "zibili.db"
    Database(str(db_path), seed_dir=seed_dir)
    ingest_paths(
        [pdf],
        db_path=db_path,
        files_dir=root / "files",
        linearize=False,
        id_map_path=root / "id-map.json",
        seed_dir=seed_dir,
    )
    return db_path, seed_dir


class QueryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.db_path, self.seed_dir = seeded_database(self.root)
        self.connection = sqlite3.connect(self.db_path)
        self.connection.row_factory = sqlite3.Row

    def tearDown(self) -> None:
        self.connection.close()
        self.temporary.cleanup()

    def test_roster_is_scoped_to_the_instructor(self) -> None:
        self.assertEqual(roster(self.connection, "phil1010-2026sp", "admin-okafor"), [])
        self.assertEqual(roster(self.connection, "phil1010-2026sp", "nobody"), [])
        rows = roster(self.connection, "phil1010-2026sp", INSTRUCTOR)
        self.assertEqual(len(rows), 25)
        self.assertEqual(sorted(r["display_name"] for r in rows), sorted(STUDENT_NAMES))
        self.assertTrue(all(r["assigned_total"] == 3 for r in rows))
        self.assertTrue(any(r["assigned_read"] > 0 for r in rows))
        self.assertTrue(any(r["dwell_seconds"] > 0 for r in rows))
        current = roster(self.connection, "phil1010-2026fa", INSTRUCTOR)
        self.assertEqual(len(current), 25)
        self.assertTrue(all(r["last_active"] is None and r["sections_opened"] == 0 for r in current))

    def test_courses_ordered_latest_first(self) -> None:
        courses = courses_for_instructor(self.connection, INSTRUCTOR)
        self.assertEqual([c["term"] for c in courses], ["2026FA", "2026SP"])
        self.assertEqual(courses[0]["enrolled"], 25)
        self.assertEqual(courses[0]["assigned"], 3)
        self.assertEqual(courses_for_instructor(self.connection, "admin-okafor"), [])

    def test_student_name_and_trail_need_the_owner(self) -> None:
        rows = roster(self.connection, "phil1010-2026sp", INSTRUCTOR)
        busy = max(rows, key=lambda r: r["sections_opened"])
        self.assertEqual(student_name(self.connection, "phil1010-2026sp", INSTRUCTOR, busy["student_hash"]), busy["display_name"])
        self.assertIsNone(student_name(self.connection, "phil1010-2026sp", "admin-okafor", busy["student_hash"]))
        trail = student_trail(self.connection, "phil1010-2026sp", INSTRUCTOR, busy["student_hash"])
        self.assertEqual(len(trail), busy["sections_opened"])
        self.assertTrue(all(t["title"] for t in trail))
        self.assertEqual(student_trail(self.connection, "phil1010-2026sp", "admin-okafor", busy["student_hash"]), [])

    def test_rollup_and_assigned(self) -> None:
        rollup = section_rollup(self.connection, "phil1010-2026sp", INSTRUCTOR)
        self.assertTrue(rollup)
        self.assertTrue(all(r["assigned"] == 1 for r in rollup))
        self.assertTrue(all(r["readers"] <= 25 for r in rollup))
        assigned = assigned_sections(self.connection, "phil1010-2026sp", INSTRUCTOR)
        self.assertEqual([a["id"] for a in assigned], ["seed-book-ch01-s01", "seed-book-ch01-s02", "seed-book-ch02-s01"])
        self.assertEqual(assigned_sections(self.connection, "phil1010-2026sp", "nobody"), [])

    def test_college_totals_have_no_students_in_them(self) -> None:
        terms = term_totals(self.connection)
        self.assertEqual([t["term"] for t in terms], ["2026SP", "2026FA"])
        spring, fall = terms
        self.assertEqual(spring["students_enrolled"], 25)
        self.assertGreater(spring["students_active"], 0)
        self.assertEqual(spring["displaced_cents"], 4200 * 25)
        self.assertEqual(fall["students_active"], 0)
        self.assertEqual(fall["displaced_cents"], 4200 * 25)
        courses = course_totals(self.connection, "2026SP")
        self.assertEqual(len(courses), 1)
        self.assertEqual(courses[0]["instructor"], "Prof. Marisol Reyes")
        self.assertEqual(courses[0]["fee_cents"], 4200)
        blob = json.dumps(terms) + json.dumps(courses)
        self.assertNotIn("student_hash", blob)
        for name in STUDENT_NAMES:
            self.assertNotIn(name, blob)
        self.assertEqual(sections_live(self.connection, "2026SP"), 5)

    def test_elapsed_days(self) -> None:
        from datetime import date

        self.assertEqual(elapsed_days("2026-08-24", date(2026, 9, 15)), 22)
        self.assertEqual(elapsed_days("2026-08-24", date(2026, 8, 1)), 0)
        self.assertEqual(elapsed_days("nonsense", date(2026, 8, 1)), 0)


class DashboardRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        self.db_path, seed_dir = seeded_database(root)
        config = AppConfig(
            db_path=str(self.db_path),
            static_dir=PROJECT_ROOT,
            files_dir=root / "files",
            public_base_url="http://127.0.0.1",
            seed_dir=seed_dir,
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

    def get(self, path: str, person: str | None = None) -> tuple[int, dict]:
        headers = {"Cookie": f"zibili_person={person}"} if person else {}
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            connection.request("GET", path, headers=headers)
            response = connection.getresponse()
            return response.status, json.loads(response.read() or b"{}")
        finally:
            connection.close()

    def post(self, path: str, body: dict, person: str) -> int:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            connection.request(
                "POST",
                path,
                body=json.dumps(body).encode("utf-8"),
                headers={"Cookie": f"zibili_person={person}", "Content-Type": "application/json"},
            )
            response = connection.getresponse()
            response.read()
            return response.status
        finally:
            connection.close()

    def test_instructor_routes_are_gated(self) -> None:
        self.assertEqual(self.get("/api/instructor/roster")[0], 401)
        self.assertEqual(self.get("/api/instructor/roster", "stu-cho")[0], 403)
        self.assertEqual(self.get("/api/instructor/roster", "admin-okafor")[0], 403)
        status, body = self.get("/api/instructor/roster", INSTRUCTOR)
        self.assertEqual(status, 200)
        self.assertEqual(body["course"]["term"], "2026FA")
        self.assertEqual(len(body["roster"]), 25)
        self.assertEqual([c["term"] for c in body["courses"]], ["2026FA", "2026SP"])
        self.assertEqual(len(body["assigned"]), 3)

        status, body = self.get("/api/instructor/roster?course=phil1010-2026sp", INSTRUCTOR)
        self.assertEqual(body["course"]["term"], "2026SP")
        self.assertTrue(body["rollup"])
        self.assertEqual(self.get("/api/instructor/roster?course=nope", INSTRUCTOR)[0], 404)

        busy = max(body["roster"], key=lambda r: r["sections_opened"])
        status, trail = self.get(f"/api/instructor/students/{busy['student_hash']}?course=phil1010-2026sp", INSTRUCTOR)
        self.assertEqual(status, 200)
        self.assertEqual(trail["name"], busy["display_name"])
        self.assertEqual(len(trail["trail"]), busy["sections_opened"])
        self.assertEqual(self.get(f"/api/instructor/students/{'0' * 32}", INSTRUCTOR)[0], 404)
        self.assertEqual(self.get(f"/api/instructor/students/{busy['student_hash']}", "stu-cho")[0], 403)

    def test_reading_three_sections_shows_in_the_roster(self) -> None:
        batch = {
            "events": [
                {"verb": "opened", "book_id": "seed-book", "chunk_ids": [chunk], "payload": {"page": 1}}
                for chunk in ("seed-book-ch01-s01", "seed-book-ch01-s02", "seed-book-ch02-s01")
            ]
        }
        self.assertEqual(self.post("/api/events", batch, "stu-cho"), 202)
        status, body = self.get("/api/instructor/roster?course=phil1010-2026fa", INSTRUCTOR)
        cho = next(r for r in body["roster"] if r["display_name"] == "Jiwon Cho")
        self.assertEqual(cho["sections_opened"], 3)
        others = [r for r in body["roster"] if r["display_name"] != "Jiwon Cho"]
        self.assertTrue(all(r["sections_opened"] == 0 for r in others))

    def test_college_summary(self) -> None:
        self.assertEqual(self.get("/api/college/summary")[0], 401)
        self.assertEqual(self.get("/api/college/summary", INSTRUCTOR)[0], 403)
        status, body = self.get("/api/college/summary", "admin-okafor")
        self.assertEqual(status, 200)
        self.assertEqual(body["current"]["term"], "2026FA")
        self.assertEqual(body["previous"]["term"], "2026SP")
        self.assertFalse(body["spend"]["verified"])
        self.assertEqual(body["current"]["displaced_cents"], 4200 * 25)
        self.assertEqual(body["sections_live"], 5)
        self.assertEqual(len(body["courses"]), 1)
        blob = json.dumps(body)
        self.assertNotIn("student_hash", blob)
        for name in STUDENT_NAMES:
            self.assertNotIn(name, blob)

        status, body = self.get("/api/college/summary?term=2026SP", "admin-okafor")
        self.assertEqual(body["current"]["term"], "2026SP")
        self.assertIsNone(body["previous"])
        status, body = self.get("/api/college/summary?term=bogus", "admin-okafor")
        self.assertEqual(body["current"]["term"], "2026FA")


if __name__ == "__main__":
    unittest.main()
