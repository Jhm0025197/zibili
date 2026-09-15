from __future__ import annotations

import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

import pymupdf

from ingest import ingest_paths
from server import AppConfig, create_server, parse_byte_range


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def write_pdf(path: Path, title: str) -> None:
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((72, 72), f"{title}\nCC BY-NC-SA 4.0")
    document.set_metadata({"title": title, "author": "OpenStax"})
    document.save(path)
    document.close()


class RangeParseTests(unittest.TestCase):
    def test_full_and_suffix(self) -> None:
        self.assertIsNone(parse_byte_range(None, 100))
        self.assertEqual(parse_byte_range("bytes=0-9", 100), (0, 9))
        self.assertEqual(parse_byte_range("bytes=10-", 100), (10, 99))
        self.assertEqual(parse_byte_range("bytes=-10", 100), (90, 99))
        with self.assertRaises(ValueError):
            parse_byte_range("bytes=500-600", 100)


class ServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        self.db_path = root / "zibili.db"
        self.files_dir = root / "files"
        pdf = root / "sample.pdf"
        write_pdf(pdf, "Campus Reader")
        ingest_paths(
            [pdf],
            db_path=self.db_path,
            files_dir=self.files_dir,
            linearize=False,
            id_map_path=root / "id-map.json",
        )
        config = AppConfig(
            db_path=str(self.db_path),
            static_dir=PROJECT_ROOT,
            files_dir=self.files_dir,
            public_base_url="http://127.0.0.1",
            seed_dir=PROJECT_ROOT / "seed",
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

    def request(
        self,
        method: str,
        path: str,
        headers: dict[str, str] | None = None,
        body: bytes | dict | list | None = None,
        person: str | None = None,
    ) -> tuple[int, dict[str, str], bytes]:
        headers = dict(headers or {})
        if person:
            headers["Cookie"] = f"zibili_person={person}"
        payload: bytes | None = None
        if isinstance(body, (dict, list)):
            payload = json.dumps(body).encode("utf-8")
            headers.setdefault("Content-Type", "application/json")
        elif body is not None:
            payload = body
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            connection.request(method, path, body=payload, headers=headers)
            response = connection.getresponse()
            body = response.read()
            header_map = {key.lower(): value for key, value in response.getheaders()}
            return response.status, header_map, body
        finally:
            connection.close()

    def test_health_and_catalog_shape(self) -> None:
        status, _, body = self.request("GET", "/healthz")
        self.assertEqual(status, 200)
        health = json.loads(body)
        self.assertTrue(health["ok"])
        self.assertEqual(health["books"], 1)

        status, headers, body = self.request("GET", "/api/catalog")
        self.assertEqual(status, 200)
        catalog = json.loads(body)
        self.assertEqual(len(catalog), 1)
        book = catalog[0]
        self.assertEqual(book["id"], "campus-reader")
        self.assertNotIn("formats", book)
        self.assertNotIn("rating", book)
        self.assertTrue(book["ingested_at"].endswith("Z"))
        self.assertTrue(book["pdf"].endswith("/file"))
        self.assertTrue(book["cover"].endswith("/cover"))
        self.assertIn("etag", headers)

    def test_range_and_cover(self) -> None:
        status, headers, body = self.request(
            "GET",
            "/api/books/campus-reader/file",
            headers={"Range": "bytes=0-99"},
        )
        self.assertEqual(status, 206)
        self.assertEqual(headers.get("accept-ranges"), "bytes")
        self.assertTrue(headers.get("content-range", "").startswith("bytes 0-99/"))
        self.assertEqual(len(body), 100)

        status, _, body = self.request("GET", "/api/books/campus-reader/cover")
        self.assertEqual(status, 200)
        self.assertTrue(body.startswith(b"\x89PNG"))

        status, headers, _ = self.request(
            "GET",
            "/api/books/campus-reader/file",
            headers={"Range": "bytes=999999-9999999"},
        )
        self.assertEqual(status, 416)
        self.assertIn("bytes */", headers.get("content-range", ""))

        status, headers, _ = self.request("GET", "/api/books/campus-reader/file?download=1")
        self.assertEqual(status, 200)
        self.assertIn("attachment", headers.get("content-disposition", ""))
        self.assertIn("campus-reader.pdf", headers.get("content-disposition", ""))

    def test_session_lifecycle(self) -> None:
        status, _, body = self.request("GET", "/api/session")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"person": None, "course": None})

        status, _, body = self.request("GET", "/api/session/people")
        self.assertEqual(status, 200)
        people = json.loads(body)
        self.assertEqual(people[0]["role"], "admin")
        self.assertEqual(people[1]["role"], "instructor")
        self.assertEqual(len(people), 27)
        self.assertTrue(all(set(p) == {"id", "role", "display_name"} for p in people))

        status, headers, body = self.request("POST", "/api/session", body={"person_id": "stu-cho"})
        self.assertEqual(status, 200)
        self.assertIn("zibili_person=stu-cho", headers.get("set-cookie", ""))
        self.assertIn("HttpOnly", headers.get("set-cookie", ""))
        self.assertEqual(json.loads(body)["person"]["display_name"], "Jiwon Cho")
        self.assertEqual(json.loads(body)["course"]["code"], "PHIL 1010")
        self.assertEqual(json.loads(body)["course"]["term"], "2026FA")

        status, _, body = self.request("GET", "/api/session", person="stu-cho")
        self.assertEqual(json.loads(body)["person"]["id"], "stu-cho")

        status, _, body = self.request("GET", "/api/session", person="instructor-reyes")
        self.assertEqual(json.loads(body)["course"]["instructor_id"], "instructor-reyes")

        status, _, body = self.request("GET", "/api/session", person="admin-okafor")
        self.assertIsNone(json.loads(body)["course"])

        status, _, body = self.request("GET", "/api/session", person="nobody")
        self.assertEqual(json.loads(body)["person"], None)

        status, headers, _ = self.request("DELETE", "/api/session", person="stu-cho")
        self.assertEqual(status, 200)
        self.assertIn("Max-Age=0", headers.get("set-cookie", ""))

    def test_session_post_errors(self) -> None:
        status, _, body = self.request("POST", "/api/session", body={"person_id": "nobody"})
        self.assertEqual(status, 404)
        self.assertEqual(json.loads(body)["error"]["code"], "unknown_person")

        status, _, _ = self.request("POST", "/api/session", body=b"not json", headers={"Content-Type": "application/json"})
        self.assertEqual(status, 400)

        status, _, _ = self.request("POST", "/api/session", body={})
        self.assertEqual(status, 400)

        status, _, body = self.request("POST", "/api/session", body=b"x" * 300_000)
        self.assertEqual(status, 413)

        status, _, _ = self.request("POST", "/api/catalog", body={})
        self.assertEqual(status, 404)

    def test_sections_route(self) -> None:
        status, headers, body = self.request("GET", "/api/books/campus-reader/sections")
        self.assertEqual(status, 200)
        outline = json.loads(body)
        self.assertEqual(outline["book_id"], "campus-reader")
        self.assertEqual(outline["outline"], "none")
        self.assertEqual(outline["chapters"][0]["sections"][0]["id"], "campus-reader-ch01-s01")
        self.assertIn("etag", headers)

        status, _, _ = self.request("GET", "/api/books/nope/sections")
        self.assertEqual(status, 404)

    def test_empty_catalog_is_an_empty_list(self) -> None:
        empty_db = Path(self.temporary.name) / "empty.db"
        config = AppConfig(
            db_path=str(empty_db),
            static_dir=PROJECT_ROOT,
            files_dir=self.files_dir,
            public_base_url="http://127.0.0.1",
        )
        server = create_server("127.0.0.1", 0, config)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            connection = http.client.HTTPConnection("127.0.0.1", server.server_address[1], timeout=10)
            connection.request("GET", "/api/catalog")
            response = connection.getresponse()
            body = json.loads(response.read())
            connection.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
        self.assertEqual(response.status, 200)
        self.assertEqual(body, [])

    def test_static_allowlist(self) -> None:
        status, _, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"js/home.js", body)
        self.assertIn(b"libby-loading", body)

        status, headers, _ = self.request("GET", "/favicon.svg")
        self.assertEqual(status, 200)
        self.assertIn("svg", headers.get("content-type", ""))

        for path in ("/server.py", "/data/zibili.db", "/books/sample.pdf", "/ingest.py"):
            status, _, _ = self.request("GET", path)
            self.assertEqual(status, 404, path)


if __name__ == "__main__":
    unittest.main()
