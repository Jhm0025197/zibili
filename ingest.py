"""Turn PDFs in books/ into catalog rows and linearized files under data/."""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import shutil
import sys
from pathlib import Path

import pymupdf

from library import (
    Database,
    default_books_dir,
    default_db_path,
    default_files_dir,
    slugify,
    utc_now,
)

LOGGER = logging.getLogger("zibili.ingest")

LICENSE_CC_RE = re.compile(r"CC BY(?:-[A-Z]{2,3}){0,3}\s*4\.0", re.IGNORECASE)
LICENSE_NC_SA_RE = re.compile(
    r"Creative Commons Attribution-NonCommercial-ShareAlike", re.IGNORECASE
)
LICENSE_BY_RE = re.compile(r"Creative Commons Attribution", re.IGNORECASE)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_sidecar(pdf_path: Path) -> dict:
    sidecar = pdf_path.with_suffix(".json")
    if not sidecar.is_file():
        return {}
    try:
        payload = json.loads(sidecar.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        LOGGER.warning("Ignoring sidecar %s (%s)", sidecar.name, exc)
        return {}
    return payload if isinstance(payload, dict) else {}


def extract_license(doc: pymupdf.Document) -> str:
    blob = " ".join((doc[index].get_text() or "") for index in range(min(6, doc.page_count)))
    match = LICENSE_CC_RE.search(blob)
    if match:
        return re.sub(r"\s+", " ", match.group(0)).upper().replace("CC BY", "CC BY")
    if LICENSE_NC_SA_RE.search(blob):
        return "CC BY-NC-SA 4.0"
    if LICENSE_BY_RE.search(blob):
        return "CC BY 4.0"
    return ""


def extract_description(doc: pymupdf.Document) -> str:
    for index in range(min(doc.page_count, 24)):
        text = re.sub(r"\s+", " ", (doc[index].get_text() or "")).strip()
        if len(text) < 180:
            continue
        if text.lower().startswith(("contents", "preface", "about openstax")):
            continue
        return text[:500]
    return ""


def cover_png_and_color(page: pymupdf.Page) -> tuple[bytes, str]:
    pixmap = page.get_pixmap(dpi=90)
    samples = pixmap.samples
    channels = pixmap.n
    pixels = max(pixmap.width * pixmap.height, 1)
    red = green = blue = 0
    for index in range(0, len(samples), channels):
        red += samples[index]
        green += samples[index + 1] if channels > 1 else samples[index]
        blue += samples[index + 2] if channels > 2 else samples[index]
    red //= pixels
    green //= pixels
    blue //= pixels
    return pixmap.tobytes("png"), f"#{red:02x}{green:02x}{blue:02x}"


def dump_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def is_linearized(path: Path) -> bool:
    with path.open("rb") as handle:
        head = handle.read(2048)
    return b"/Linearized" in head


def write_served_pdf(doc: pymupdf.Document, source: Path, dest: Path, linearize: bool) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if linearize and not is_linearized(source):
        tmp = dest.with_suffix(".pdf.partial")
        try:
            doc.save(str(tmp), linear=1, deflate=1)
            check = pymupdf.open(tmp)
            try:
                if check.page_count != doc.page_count:
                    raise RuntimeError("linearized page count mismatch")
            finally:
                check.close()
            tmp.replace(dest)
            return True
        except Exception as exc:
            if tmp.exists():
                tmp.unlink()
            if "no longer supported" in str(exc).lower():
                LOGGER.info("PyMuPDF cannot linearize; serving original %s", source.name)
            else:
                LOGGER.warning("Linearize failed for %s (%s); copying original", source.name, exc)
    shutil.copy2(source, dest)
    return is_linearized(dest)


def unique_id(connection, base: str, digest: str) -> str:
    candidate = base
    row = connection.execute("SELECT sha256 FROM books WHERE id = ?", (candidate,)).fetchone()
    if row is None or row["sha256"] == digest:
        return candidate
    return f"{base[:71]}-{digest[:8]}"


def ingest_one(
    connection,
    pdf_path: Path,
    files_dir: Path,
    *,
    force: bool,
    linearize: bool,
) -> str:
    digest = sha256_file(pdf_path)
    existing = connection.execute(
        "SELECT id, file_path FROM books WHERE sha256 = ?", (digest,)
    ).fetchone()
    if existing and not force:
        return "skip"

    sidecar = load_sidecar(pdf_path)
    doc = pymupdf.open(pdf_path)
    try:
        meta_title = (doc.metadata or {}).get("title") or ""
        title = str(sidecar.get("title") or meta_title or pdf_path.stem)
        author = str(sidecar.get("author") or (doc.metadata or {}).get("author") or "OpenStax")
        book_id = unique_id(connection, slugify(title), digest)
        cover_png, auto_color = cover_png_and_color(doc[0])
        license_name = str(sidecar.get("license") or extract_license(doc) or "")
        description = str(sidecar.get("description") or extract_description(doc) or "")
        dest = files_dir / f"{book_id}.pdf"
        linearized = write_served_pdf(doc, pdf_path, dest, linearize)
        page_count = doc.page_count
    finally:
        doc.close()

    file_size = dest.stat().st_size
    subjects = sidecar.get("subjects") or []
    lists = sidecar.get("lists") or ["new", "available", "popular"]
    course_codes = sidecar.get("course_codes") or []
    quote = sidecar.get("quote") or (f"Open textbook · {license_name}" if license_name else "")
    color = str(sidecar.get("color") or auto_color)

    connection.execute("DELETE FROM books WHERE sha256 = ? OR id = ?", (digest, book_id))
    connection.execute(
        """
        INSERT INTO books(
            id, sha256, title, author, publisher, released, language, isbn13,
            description, quote, subjects, lists, course_codes, audience, color,
            license, page_count, cover_png, file_path, file_size, linearized, ingested_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            book_id,
            digest,
            title,
            author,
            sidecar.get("publisher") or "OpenStax",
            sidecar.get("released") or "",
            sidecar.get("language") or "English",
            sidecar.get("isbn13") or "",
            description,
            quote,
            dump_json(subjects),
            dump_json(lists),
            dump_json(course_codes),
            sidecar.get("audience") or "adults",
            color,
            license_name,
            page_count,
            cover_png,
            str(dest),
            file_size,
            1 if linearized else 0,
            utc_now(),
        ),
    )
    return "add"


def ingest_paths(
    paths: list[Path],
    *,
    db_path: Path,
    files_dir: Path,
    force: bool = False,
    linearize: bool = True,
) -> dict[str, int]:
    files_dir.mkdir(parents=True, exist_ok=True)
    database = Database(str(db_path))
    added = skipped = failed = 0
    connection = database.connect()
    try:
        for pdf_path in paths:
            try:
                with database.transaction(connection):
                    result = ingest_one(
                        connection, pdf_path, files_dir, force=force, linearize=linearize
                    )
                if result == "skip":
                    skipped += 1
                    LOGGER.info("skipped %s (unchanged)", pdf_path.name)
                else:
                    added += 1
                    LOGGER.info("ingested %s", pdf_path.name)
                    database.bump_revision(connection)
            except Exception:
                failed += 1
                LOGGER.exception("failed %s", pdf_path)
    finally:
        connection.close()
    return {"added": added, "skipped": skipped, "failed": failed}


def discover_pdfs(paths: list[str], books_dir: Path) -> list[Path]:
    if paths:
        found = [Path(item) for item in paths]
    else:
        found = sorted(books_dir.glob("*.pdf"))
    missing = [path for path in found if not path.is_file()]
    if missing:
        names = ", ".join(str(path) for path in missing)
        raise SystemExit(f"PDF not found: {names}")
    return found


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest OER PDFs into the Zibili catalog")
    parser.add_argument("command", nargs="?", default="add", choices=["add"])
    parser.add_argument("paths", nargs="*", help="PDF files (default: books/*.pdf)")
    parser.add_argument("--books-dir", default=str(default_books_dir()))
    parser.add_argument("--db", default=str(default_db_path()))
    parser.add_argument("--files-dir", default=str(default_files_dir()))
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--no-linearize", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    pdfs = discover_pdfs(args.paths, Path(args.books_dir))
    if not pdfs:
        print("No PDFs found.", file=sys.stderr)
        raise SystemExit(1)
    stats = ingest_paths(
        pdfs,
        db_path=Path(args.db),
        files_dir=Path(args.files_dir),
        force=args.force,
        linearize=not args.no_linearize,
    )
    print(f"added {stats['added']}, skipped {stats['skipped']}, failed {stats['failed']}")
    if stats["failed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
