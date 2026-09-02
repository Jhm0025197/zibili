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
        ingest_paths([pdf], db_path=self.db_path, files_dir=self.files_dir, linearize=False)
        config = AppConfig(
            db_path=str(self.db_path),
            static_dir=PROJECT_ROOT,
            files_dir=self.files_dir,
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

    def request(
        self,
        method: str,
        path: str,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, dict[str, str], bytes]:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            connection.request(method, path, headers=headers or {})
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
        self.assertEqual(book["formats"][0]["type"], "ebook")
        self.assertTrue(book["formats"][0]["available"])
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

    def test_static_allowlist(self) -> None:
        status, _, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"js/home.js", body)

        for path in ("/server.py", "/data/zibili.db", "/books/sample.pdf", "/ingest.py"):
            status, _, _ = self.request("GET", path)
            self.assertEqual(status, 404, path)


if __name__ == "__main__":
    unittest.main()
