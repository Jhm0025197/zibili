"""Sections from a PDF outline, with IDs that never move.

A section is one entry in the outline under a numbered chapter. Its ID is
``{book}-ch{NN}-s{NN}``. IDs are minted once and persisted in an id-map
(``books/id-map.json``) keyed on the chapter number plus the normalised
section title, so re-ordering keeps every ID, re-ingesting an unchanged file
mints nothing, and a section that vanishes is tombstoned so its number is
never handed out again.

Retitling a section reads as a delete plus an insert. That is a known limit;
see docs/backlog.md.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from library import slugify

ID_MAP_VERSION = 1

CHAPTER_RE = re.compile(r"^\s*(?:chapter|unit|part)?\s*(\d{1,3})\b[.:\s-]*(.*)$", re.IGNORECASE)
SECTION_RE = re.compile(r"^\s*(\d{1,3})\.(\d{1,3})\b[.:\s-]*(.*)$")
SKIP_TITLES = {
    "contents",
    "table of contents",
    "index",
    "answer key",
    "answer keys",
}


@dataclass
class Section:
    id: str
    chapter: int
    section: int
    number: str | None
    title: str
    chapter_title: str
    start_page: int
    end_page: int
    words: int = 0
    position: int = 0
    tombstoned: bool = False

    def row(self, book_id: str) -> tuple[Any, ...]:
        return (
            self.id,
            book_id,
            self.chapter,
            self.section,
            self.number,
            self.title,
            self.chapter_title,
            self.start_page,
            self.end_page,
            self.words,
            self.position,
            1 if self.tombstoned else 0,
        )


@dataclass
class Outline:
    status: str  # ok | flat | none
    sections: list[Section]
    omitted: list[str] = field(default_factory=list)
    minted: int = 0
    reused: int = 0
    tombstoned: int = 0


def load_id_map(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {"version": ID_MAP_VERSION, "books": {}}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or "books" not in payload:
        raise ValueError(f"{path} is not an id-map")
    return payload


def save_id_map(path: Path, id_map: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(id_map, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def section_key(chapter: int, title: str) -> str:
    return f"{chapter}|{slugify(title)}"


def _strip_number(title: str) -> str:
    match = SECTION_RE.match(title)
    if match and match.group(3):
        return match.group(3).strip()
    return title.strip()


def _chapter_parts(title: str) -> tuple[int | None, str]:
    match = CHAPTER_RE.match(title)
    if match:
        return int(match.group(1)), (match.group(2) or title).strip()
    return None, title.strip()


def build_outline(
    toc: list[list[Any]],
    page_count: int,
    book_id: str,
    id_map: dict[str, Any],
    words_for_range=None,
) -> Outline:
    """Turn ``doc.get_toc()`` into sections with stable IDs.

    ``words_for_range(start_page, end_page)`` returns a word count; it is
    optional so tests can skip the expensive text extraction.
    """
    book_map = id_map.setdefault("books", {}).setdefault(book_id, {"sections": {}, "tombstoned": []})
    known: dict[str, dict[str, Any]] = book_map.setdefault("sections", {})
    tombs: list[dict[str, Any]] = book_map.setdefault("tombstoned", [])

    entries = [
        {"level": int(level), "title": str(title).strip(), "page": int(page)}
        for level, title, page, *_ in toc
        if int(page) >= 1
    ]
    omitted: list[str] = [str(t) for _, t, p, *_ in toc if int(p) < 1]

    # Pass 1: chapters. Numbered level-1 entries are chapters. If no level-1
    # entry carries a number, number them by order instead.
    level1 = [e for e in entries if e["level"] == 1]
    numbered = [(e, _chapter_parts(e["title"])) for e in level1]
    any_numbered = any(n is not None for _, (n, _) in numbered)
    chapters: list[dict[str, Any]] = []
    order = 0
    for entry, (number, clean_title) in numbered:
        if entry["title"].strip().lower() in SKIP_TITLES:
            omitted.append(entry["title"])
            entry["chapter"] = None
            continue
        if number is None and any_numbered:
            omitted.append(entry["title"])
            entry["chapter"] = None
            continue
        order += 1
        chapter_number = number if number is not None else order
        entry["chapter"] = chapter_number
        chapters.append({"number": chapter_number, "title": clean_title, "page": entry["page"], "entry": entry})

    if not chapters:
        return _fallback_none(page_count, book_id, known, tombs, words_for_range, omitted)

    # Pass 2: sections. Level-2 entries belong to the most recent chapter.
    current: dict[str, Any] | None = None
    per_chapter: dict[int, list[dict[str, Any]]] = {c["number"]: [] for c in chapters}
    for entry in entries:
        if entry["level"] == 1:
            current = entry if entry.get("chapter") else None
            continue
        if entry["level"] != 2:
            continue
        if current is None:
            omitted.append(entry["title"])
            continue
        per_chapter[current["chapter"]].append(entry)

    status = "ok" if any(per_chapter.values()) else "flat"
    if status == "flat":
        for chapter in chapters:
            per_chapter[chapter["number"]] = [
                {"level": 2, "title": chapter["title"], "page": chapter["page"], "flat": True}
            ]

    # End pages: the next outline entry (any level) on a later page.
    boundaries = sorted({e["page"] for e in entries})

    def end_page_for(page: int) -> int:
        for boundary in boundaries:
            if boundary > page:
                return boundary - 1
        return page_count

    sections: list[Section] = []
    seen_keys: set[str] = set()
    minted = reused = 0
    position = 0
    for chapter in chapters:
        number = chapter["number"]
        used = _used_numbers(known, tombs, number)
        pending: list[tuple[dict[str, Any], str, str | None, int | None]] = []
        for entry in per_chapter[number]:
            match = None if entry.get("flat") else SECTION_RE.match(entry["title"])
            printed = f"{match.group(1)}.{match.group(2)}" if match and int(match.group(1)) == number else None
            wanted = int(match.group(2)) if printed else None
            clean = _strip_number(entry["title"]) if printed else entry["title"]
            pending.append((entry, clean, printed, wanted))

        # Known keys first so their numbers are reserved, then printed numbers,
        # then everything else takes the next free number.
        assigned: dict[int, int] = {}
        for index, (entry, clean, printed, wanted) in enumerate(pending):
            key = section_key(number, clean)
            if key in known:
                assigned[index] = known[key]["section"]
                used.add(known[key]["section"])
        for index, (entry, clean, printed, wanted) in enumerate(pending):
            if index in assigned:
                continue
            if wanted is not None and wanted not in used:
                assigned[index] = wanted
                used.add(wanted)
        for index, (entry, clean, printed, wanted) in enumerate(pending):
            if index in assigned:
                continue
            candidate = 1
            while candidate in used:
                candidate += 1
            assigned[index] = candidate
            used.add(candidate)

        for index, (entry, clean, printed, wanted) in enumerate(pending):
            key = section_key(number, clean)
            section_number = assigned[index]
            section_id = f"{book_id}-ch{number:02d}-s{section_number:02d}"
            if key in known:
                reused += 1
                known[key]["title"] = clean
            else:
                minted += 1
                known[key] = {"id": section_id, "section": section_number, "title": clean}
            seen_keys.add(key)
            position += 1
            start = entry["page"]
            end = max(start, end_page_for(start))
            sections.append(
                Section(
                    id=known[key]["id"],
                    chapter=number,
                    section=section_number,
                    number=printed,
                    title=clean,
                    chapter_title=chapter["title"],
                    start_page=start,
                    end_page=end,
                    words=words_for_range(start, end) if words_for_range else 0,
                    position=position,
                )
            )

    # Tombstone anything the map knows that this outline no longer has.
    newly_tombstoned = 0
    for key in list(known.keys()):
        if key in seen_keys:
            continue
        record = known.pop(key)
        tombs.append({"key": key, **record})
        newly_tombstoned += 1
    for tomb in tombs:
        chapter_number = int(tomb["key"].split("|", 1)[0])
        chapter_title = next((c["title"] for c in chapters if c["number"] == chapter_number), "")
        position += 1
        sections.append(
            Section(
                id=tomb["id"],
                chapter=chapter_number,
                section=int(tomb["section"]),
                number=None,
                title=tomb.get("title", ""),
                chapter_title=chapter_title,
                start_page=0,
                end_page=0,
                words=0,
                position=position,
                tombstoned=True,
            )
        )

    return Outline(status=status, sections=sections, omitted=omitted, minted=minted, reused=reused, tombstoned=newly_tombstoned)


def _used_numbers(known: dict[str, dict[str, Any]], tombs: list[dict[str, Any]], chapter: int) -> set[int]:
    used: set[int] = set()
    prefix = f"{chapter}|"
    for key, record in known.items():
        if key.startswith(prefix):
            used.add(int(record["section"]))
    for tomb in tombs:
        if tomb["key"].startswith(prefix):
            used.add(int(tomb["section"]))
    return used


def _fallback_none(page_count, book_id, known, tombs, words_for_range, omitted) -> Outline:
    key = section_key(1, "Whole book")
    minted = 0
    if key not in known:
        known[key] = {"id": f"{book_id}-ch01-s01", "section": 1, "title": "Whole book"}
        minted = 1
    section = Section(
        id=known[key]["id"],
        chapter=1,
        section=1,
        number=None,
        title="Whole book",
        chapter_title="Whole book",
        start_page=1,
        end_page=page_count,
        words=words_for_range(1, page_count) if words_for_range else 0,
        position=1,
    )
    return Outline(status="none", sections=[section], omitted=omitted, minted=minted, reused=1 - minted)
