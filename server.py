"""Stdlib HTTP server for the Zibili catalog and PDFs."""

from __future__ import annotations

import argparse
import json
import logging
import mimetypes
import os
import re
import sqlite3
import sys
import threading
from dataclasses import dataclass
from email.utils import formatdate
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

from library import (
    APP_VERSION,
    BOOK_ID_RE,
    Database,
    book_count,
    book_to_json,
    default_db_path,
    default_files_dir,
    get_book,
    list_books,
)

LOGGER = logging.getLogger("zibili")

mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("text/javascript", ".js")

PUBLIC_ROOT_FILES = {
    "index.html",
    "list.html",
    "title.html",
    "shelf.html",
    "menu.html",
    "read.html",
    "favicon.ico",
    "favicon.svg",
    "favicon.png",
}
PUBLIC_DIRS = {"js", "css", "vendor"}
PUBLIC_SUFFIXES = {
    ".css",
    ".js",
    ".mjs",
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
    ".html",
    ".json",
    ".map",
}
BOOK_FILE_RE = re.compile(r"^/api/books/([a-z0-9][a-z0-9-]{0,79})/file$")
BOOK_COVER_RE = re.compile(r"^/api/books/([a-z0-9][a-z0-9-]{0,79})/cover$")
BOOK_ITEM_RE = re.compile(r"^/api/books/([a-z0-9][a-z0-9-]{0,79})$")


class APIError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


@dataclass(frozen=True)
class AppConfig:
    db_path: str
    static_dir: Path
    files_dir: Path
    public_base_url: str = "http://localhost:5174"
    max_request_threads: int = 128
    socket_timeout_seconds: float = 120.0

    @classmethod
    def from_environment(
        cls,
        db_path: str,
        static_dir: str | Path,
        files_dir: str | Path,
        public_base_url: str,
    ) -> AppConfig:
        return cls(
            db_path=db_path,
            static_dir=Path(static_dir).resolve(),
            files_dir=Path(files_dir).resolve(),
            public_base_url=public_base_url.rstrip("/"),
            max_request_threads=max(
                8, min(int(os.environ.get("MAX_REQUEST_THREADS", "128")), 512)
            ),
            socket_timeout_seconds=max(
                5.0, min(float(os.environ.get("SOCKET_TIMEOUT_SECONDS", "120")), 300.0)
            ),
        )


class ZibiliApp:
    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self.config.files_dir.mkdir(parents=True, exist_ok=True)
        self.db = Database(config.db_path)


class ZibiliHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128

    def __init__(self, address: tuple[str, int], app: ZibiliApp) -> None:
        self.app = app
        self._request_slots = threading.BoundedSemaphore(app.config.max_request_threads)
        super().__init__(address, ZibiliHandler)

    def process_request(self, request: Any, client_address: Any) -> None:
        if not self._request_slots.acquire(blocking=False):
            body = b'{"error":{"code":"server_busy","message":"Zibili is busy. Try again."}}'
            try:
                request.settimeout(1.0)
                request.sendall(
                    b"HTTP/1.1 503 Service Unavailable\r\n"
                    b"Content-Type: application/json; charset=utf-8\r\n"
                    b"Connection: close\r\n"
                    + f"Content-Length: {len(body)}\r\n\r\n".encode("ascii")
                    + body
                )
            except OSError:
                pass
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self._request_slots.release()
            raise

    def process_request_thread(self, request: Any, client_address: Any) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._request_slots.release()

    def handle_error(self, request: Any, client_address: Any) -> None:
        error = sys.exc_info()[1]
        if isinstance(error, (BrokenPipeError, ConnectionResetError, TimeoutError)):
            return
        super().handle_error(request, client_address)


def parse_byte_range(header: str | None, size: int) -> tuple[int, int] | None:
    if not header:
        return None
    if not header.lower().startswith("bytes="):
        raise ValueError("bad range")
    spec = header.split("=", 1)[1].split(",")[0].strip()
    if "-" not in spec:
        raise ValueError("bad range")
    start_s, end_s = spec.split("-", 1)
    if start_s == "":
        length = int(end_s)
        if length <= 0:
            raise ValueError("bad range")
        if length >= size:
            return 0, size - 1
        return size - length, size - 1
    start = int(start_s)
    end = int(end_s) if end_s else size - 1
    if start < 0 or start >= size or end < start:
        raise ValueError("unsatisfiable")
    return start, min(end, size - 1)


class ZibiliHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "Zibili"
    sys_version = ""

    @property
    def app(self) -> ZibiliApp:
        return self.server.app  # type: ignore[attr-defined]

    @property
    def parsed_url(self):
        return urlsplit(self.path)

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(self.app.config.socket_timeout_seconds)

    def log_request(self, code: int | str = "-", size: int | str = "-") -> None:
        LOGGER.info(
            '%s - "%s %s %s" %s %s',
            self.client_address[0],
            self.command,
            self.parsed_url.path,
            self.request_version,
            code,
            size,
        )

    def log_message(self, fmt: str, *args: Any) -> None:
        LOGGER.debug("HTTP handler message suppressed: %s", fmt)

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def do_HEAD(self) -> None:  # noqa: N802
        self._dispatch("HEAD")

    def do_OPTIONS(self) -> None:  # noqa: N802
        try:
            self.send_response(204)
            self.send_header("Allow", "GET, HEAD, OPTIONS")
            self.send_header("Content-Length", "0")
            self._security_headers()
            self.end_headers()
        except APIError as exc:
            self.send_error_json(exc)

    def _dispatch(self, method: str) -> None:
        try:
            self._route(method)
        except APIError as exc:
            self.send_error_json(exc)
        except (BrokenPipeError, ConnectionResetError):
            return
        except TimeoutError:
            self.close_connection = True
            self.send_error_json(APIError(408, "request_timeout", "The request timed out."))
        except sqlite3.OperationalError as exc:
            if "locked" in str(exc).lower() or "busy" in str(exc).lower():
                self.send_error_json(
                    APIError(503, "database_busy", "Zibili is busy. Please retry shortly.")
                )
                return
            LOGGER.exception("SQLite operation failed")
            self.send_error_json(APIError(500, "internal_error", "Something went wrong."))
        except Exception:
            LOGGER.exception("Unhandled request error on %s %s", method, self.parsed_url.path)
            self.send_error_json(APIError(500, "internal_error", "Something went wrong."))

    def _route(self, method: str) -> None:
        path = self.parsed_url.path
        if method in {"GET", "HEAD"} and path in {"/healthz", "/api/health"}:
            self.handle_health()
            return
        if method in {"GET", "HEAD"} and path == "/api/catalog":
            self.handle_catalog()
            return
        cover = BOOK_COVER_RE.match(path)
        if method in {"GET", "HEAD"} and cover:
            self.handle_cover(cover.group(1), head_only=method == "HEAD")
            return
        pdf = BOOK_FILE_RE.match(path)
        if method in {"GET", "HEAD"} and pdf:
            self.handle_file(pdf.group(1), head_only=method == "HEAD")
            return
        item = BOOK_ITEM_RE.match(path)
        if method in {"GET", "HEAD"} and item:
            self.handle_book(item.group(1))
            return
        if path.startswith("/api/"):
            raise APIError(404, "not_found", "API route not found.")
        if method in {"GET", "HEAD"}:
            self.handle_static(head_only=method == "HEAD")
            return
        raise APIError(404, "not_found", "Route not found.")

    def _security_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

    def send_json(
        self,
        status: int,
        payload: Any,
        *,
        extra_headers: dict[str, str] | None = None,
        cache_control: str = "no-store",
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache_control)
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self._security_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_error_json(self, error: APIError) -> None:
        self.send_json(
            error.status,
            {"error": {"code": error.code, "message": error.message}},
        )

    def handle_health(self) -> None:
        connection = self.app.db.connect()
        try:
            connection.execute("SELECT 1").fetchone()
            count = book_count(connection)
        finally:
            connection.close()
        self.send_json(200, {"ok": True, "version": APP_VERSION, "books": count})

    def handle_catalog(self) -> None:
        connection = self.app.db.connect()
        try:
            books = list_books(connection)
            revision = self.app.db.revision(connection)
        finally:
            connection.close()
        etag = f'"{revision}-{len(books)}"'
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Content-Length", "0")
            self._security_headers()
            self.end_headers()
            return
        self.send_json(
            200,
            books,
            extra_headers={"ETag": etag},
            cache_control="no-cache",
        )

    def handle_book(self, book_id: str) -> None:
        if not BOOK_ID_RE.fullmatch(book_id):
            raise APIError(404, "not_found", "Book not found.")
        connection = self.app.db.connect()
        try:
            row = get_book(connection, book_id)
            books = list_books(connection) if row else []
        finally:
            connection.close()
        if row is None:
            raise APIError(404, "not_found", "Book not found.")
        payload = book_to_json(row)
        payload["similar"] = [book["id"] for book in books if book["id"] != book_id][:8]
        self.send_json(200, payload, cache_control="no-cache")

    def handle_cover(self, book_id: str, head_only: bool) -> None:
        if not BOOK_ID_RE.fullmatch(book_id):
            raise APIError(404, "not_found", "Book not found.")
        connection = self.app.db.connect()
        try:
            row = connection.execute(
                "SELECT cover_png, sha256 FROM books WHERE id = ?", (book_id,)
            ).fetchone()
        finally:
            connection.close()
        if row is None or not row["cover_png"]:
            raise APIError(404, "not_found", "Cover not found.")
        body = bytes(row["cover_png"])
        etag = f'"cover-{row["sha256"][:16]}"'
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Content-Length", "0")
            self._security_headers()
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("ETag", etag)
        self.send_header("Cache-Control", "public, max-age=86400")
        self._security_headers()
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def handle_file(self, book_id: str, head_only: bool) -> None:
        if not BOOK_ID_RE.fullmatch(book_id):
            raise APIError(404, "not_found", "Book not found.")
        connection = self.app.db.connect()
        try:
            row = connection.execute(
                "SELECT file_path, sha256 FROM books WHERE id = ?", (book_id,)
            ).fetchone()
        finally:
            connection.close()
        if row is None:
            raise APIError(404, "not_found", "Book not found.")
        path = Path(row["file_path"]).resolve()
        try:
            path.relative_to(self.app.config.files_dir.resolve())
        except ValueError as exc:
            raise APIError(404, "not_found", "Book not found.") from exc
        if not path.is_file():
            raise APIError(404, "not_found", "File missing.")
        size = path.stat().st_size
        etag = f'"{row["sha256"][:32]}"'
        if self.headers.get("If-None-Match") == etag and not self.headers.get("Range"):
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", "0")
            self._security_headers()
            self.end_headers()
            return
        try:
            byte_range = parse_byte_range(self.headers.get("Range"), size)
        except ValueError:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", "0")
            self._security_headers()
            self.end_headers()
            return
        if byte_range is None:
            start, end, status = 0, size - 1, 200
        else:
            start, end = byte_range
            status = 206
        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("ETag", etag)
        download = any(
            value.lower() in {"1", "true", "yes"}
            for value in parse_qs(self.parsed_url.query).get("download", [])
        )
        self.send_header("Cache-Control", "public, max-age=86400")
        disposition = "attachment" if download else "inline"
        self.send_header("Content-Disposition", f'{disposition}; filename="{book_id}.pdf"')
        self.send_header("Last-Modified", formatdate(path.stat().st_mtime, usegmt=True))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self._security_headers()
        self.end_headers()
        if head_only:
            return
        with path.open("rb") as handle:
            handle.seek(start)
            remaining = length
            while remaining:
                chunk = handle.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def handle_static(self, head_only: bool) -> None:
        root = self.app.config.static_dir
        raw_path = unquote(self.parsed_url.path)
        relative = "index.html" if raw_path == "/" else raw_path.lstrip("/")
        if "\x00" in relative or any(part.startswith(".") for part in Path(relative).parts):
            raise APIError(404, "not_found", "File not found.")
        relative_path = Path(relative)
        is_root = len(relative_path.parts) == 1 and relative in PUBLIC_ROOT_FILES
        is_asset = (
            len(relative_path.parts) > 1
            and relative_path.parts[0] in PUBLIC_DIRS
            and relative_path.suffix.lower() in PUBLIC_SUFFIXES
        )
        if not (is_root or is_asset):
            raise APIError(404, "not_found", "File not found.")
        candidate = (root / relative).resolve()
        try:
            candidate.relative_to(root)
        except ValueError as exc:
            raise APIError(404, "not_found", "File not found.") from exc
        if not candidate.is_file():
            raise APIError(404, "not_found", "File not found.")
        stat = candidate.stat()
        etag = f'"{stat.st_mtime_ns:x}-{stat.st_size:x}"'
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Content-Length", "0")
            self._security_headers()
            self.end_headers()
            return
        content_type, encoding = mimetypes.guess_type(str(candidate))
        self.send_response(200)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        if encoding:
            self.send_header("Content-Encoding", encoding)
        self.send_header("Content-Length", str(stat.st_size))
        self.send_header("Last-Modified", formatdate(stat.st_mtime, usegmt=True))
        self.send_header("ETag", etag)
        self.send_header(
            "Cache-Control",
            "no-cache" if candidate.suffix in {".html", ".js", ".mjs"} else "public, max-age=300",
        )
        self._security_headers()
        self.end_headers()
        if head_only:
            return
        with candidate.open("rb") as handle:
            while chunk := handle.read(64 * 1024):
                self.wfile.write(chunk)


def create_server(
    host: str = "127.0.0.1",
    port: int = 5174,
    config: AppConfig | None = None,
) -> ZibiliHTTPServer:
    if config is None:
        project_dir = Path(__file__).resolve().parent
        config = AppConfig.from_environment(
            db_path=os.environ.get("ZIBILI_DB", str(default_db_path())),
            static_dir=project_dir,
            files_dir=os.environ.get("ZIBILI_FILES_DIR", str(default_files_dir())),
            public_base_url=f"http://{host}:{port}",
        )
    return ZibiliHTTPServer((host, port), ZibiliApp(config))


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Zibili library server")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "5174")))
    parser.add_argument("--db", default=os.environ.get("ZIBILI_DB"))
    parser.add_argument("--files-dir", default=os.environ.get("ZIBILI_FILES_DIR"))
    parser.add_argument("--static", default=None)
    args = parser.parse_args()

    project_dir = Path(__file__).resolve().parent
    config = AppConfig.from_environment(
        db_path=args.db or str(default_db_path()),
        static_dir=args.static or str(project_dir),
        files_dir=args.files_dir or str(default_files_dir()),
        public_base_url=f"http://{args.host}:{args.port}",
    )
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    server = create_server(args.host, args.port, config)
    LOGGER.info("Zibili is ready at %s (database: %s)", config.public_base_url, config.db_path)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        LOGGER.info("Stopping Zibili")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
