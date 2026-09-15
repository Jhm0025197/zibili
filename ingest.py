"""Turn PDFs in books/ into catalog rows, outline sections and served files under data/."""

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
    default_seed_dir,
    slugify,
    utc_now,
)
from sections import build_outline, load_id_map, save_id_map

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


def default_id_map_path() -> Path:
    return default_books_dir() / "id-map.json"


def word_counter(doc: pymupdf.Document):
    """Word count per page range, extracting each page's text at most once."""
    cache: dict[int, int] = {}

    def count(start_page: int, end_page: int) -> int:
        total = 0
        for page_number in range(start_page, end_page + 1):
            if page_number not in cache:
                index = page_number - 1
                if 0 <= index < doc.page_count:
                    cache[page_number] = len(doc[index].get_text("words"))
                else:
                    cache[page_number] = 0
            total += cache[page_number]
        return total

    return count


def write_sections(connection, doc: pymupdf.Document, book_id: str, id_map: dict) -> None:
    outline = build_outline(doc.get_toc(), doc.page_count, book_id, id_map, word_counter(doc))
    connection.execute("DELETE FROM sections WHERE book_id = ?", (book_id,))
    connection.executemany(
        """
        INSERT INTO sections(
            id, book_id, chapter, section, number, title, chapter_title,
            start_page, end_page, words, position, tombstoned
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        [section.row(book_id) for section in outline.sections],
    )
    connection.execute(
        "INSERT OR REPLACE INTO app_meta(key, value) VALUES (?, ?)",
        (f"outline:{book_id}", outline.status),
    )
    connection.execute(
        "INSERT OR REPLACE INTO app_meta(key, value) VALUES (?, ?)",
        (f"outline_omitted:{book_id}", dump_json(outline.omitted)),
    )
    live = [s for s in outline.sections if not s.tombstoned]
    LOGGER.info(
        "%s: outline %s, %d sections in %d chapters; ids %d minted, %d reused, %d tombstoned",
        book_id,
        outline.status,
        len(live),
        len({s.chapter for s in live}),
        outline.minted,
        outline.reused,
        outline.tombstoned,
    )
    if outline.minted == 0 and outline.tombstoned == 0:
        LOGGER.info("%s: no ID churn, re-ingest was stable", book_id)
    if outline.status != "ok":
        LOGGER.warning(
            "%s: the PDF outline is %s; sections are %s",
            book_id,
            "missing" if outline.status == "none" else "one level deep",
            "the whole book" if outline.status == "none" else "one per chapter",
        )


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
    id_map: dict | None = None,
) -> str:
    id_map = id_map if id_map is not None else {"version": 1, "books": {}}
    digest = sha256_file(pdf_path)
    existing = connection.execute(
        "SELECT id, file_path FROM books WHERE sha256 = ?", (digest,)
    ).fetchone()
    if existing and not force:
        have = connection.execute(
            "SELECT COUNT(*) FROM sections WHERE book_id = ?", (existing["id"],)
        ).fetchone()[0]
        if have:
            return "skip"
        doc = pymupdf.open(pdf_path)
        try:
            write_sections(connection, doc, existing["id"], id_map)
        finally:
            doc.close()
        return "backfill"

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
        toc_doc = doc
        doc = None  # sections are written after the book row, below
    finally:
        if doc is not None:
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
    try:
        write_sections(connection, toc_doc, book_id, id_map)
    finally:
        toc_doc.close()
    return "add"


def ingest_paths(
    paths: list[Path],
    *,
    db_path: Path,
    files_dir: Path,
    force: bool = False,
    linearize: bool = True,
    id_map_path: Path | None = None,
    seed_dir: Path | None = None,
) -> dict[str, int]:
    files_dir.mkdir(parents=True, exist_ok=True)
    id_map_path = id_map_path or default_id_map_path()
    id_map = load_id_map(id_map_path)
    database = Database(str(db_path), seed_dir=seed_dir)
    added = skipped = failed = 0
    connection = database.connect()
    try:
        for pdf_path in paths:
            try:
                with database.transaction(connection):
                    result = ingest_one(
                        connection,
                        pdf_path,
                        files_dir,
                        force=force,
                        linearize=linearize,
                        id_map=id_map,
                    )
                if result == "skip":
                    skipped += 1
                    LOGGER.info("skipped %s (unchanged)", pdf_path.name)
                elif result == "backfill":
                    skipped += 1
                    LOGGER.info("skipped %s (unchanged); added its sections", pdf_path.name)
                    database.bump_revision(connection)
                else:
                    added += 1
                    LOGGER.info("ingested %s", pdf_path.name)
                    database.bump_revision(connection)
            except Exception:
                failed += 1
                LOGGER.exception("failed %s", pdf_path)
        save_id_map(id_map_path, id_map)
        # Assignments and prior-term history need sections, which now exist.
        database.seed(connection)
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
    parser.add_argument("--id-map", default=str(default_id_map_path()))
    parser.add_argument("--seed-dir", default=str(default_seed_dir()))
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
        id_map_path=Path(args.id_map),
        seed_dir=Path(args.seed_dir),
    )
    print(f"added {stats['added']}, skipped {stats['skipped']}, failed {stats['failed']}")
    if stats["failed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
