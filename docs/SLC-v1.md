# Zibili — SLC v1 (Simple, Lovable, Complete)

Internal replacement for BibliU. One test book, one course, three views, zero running cost.

---

## What "complete" means

A student opens the library page, sees the book, and can either **download** the original or **read** it. Reading opens the page-based PDF reader. Every section a student reads writes a real event. The professor view shows those events per student. The college view shows the money and engagement roll-up. All three views ship in the same app, on the same data, with no API keys required to run.

Not in v1: AI renders, TTS, LTI, the format wheel's renderers (the wheel itself is present), markdown chunking. Stubbed where cheap, otherwise one line in `docs/backlog.md`.

---

## Zero-cost stack

- Plain HTML, CSS, and JavaScript ES modules. No build step. Served by `server.py`.
- Python 3.11 standard library HTTP server. SQLite file at `data/zibili.db`, gitignored, created on first run.
- Books are OpenStax PDFs dropped in `books/`. Ingest (PyMuPDF) copies the file, renders a cover, and reads the PDF outline into a `sections` table. Sections are the unit the ledger, assignments, and dashboards join on.
- PDF.js (vendored) renders pages in the browser.
- No model calls, no paid services, no network calls at runtime beyond Google Fonts.

---

## Content model

A section is one entry in the PDF outline under a numbered chapter. ID: `{book}-ch{NN}-s{NN}`. IDs are assigned at ingest, persisted in `books/id-map.json`, and never reassigned. Re-ingest of unchanged source mints zero IDs. Sections that vanish are tombstoned, never recycled.

Page numbers are 1-based physical page indices, the same numbers PDF.js uses.

---

## The three views

**Library.** Home shelves, search, title page with cover, description, license, course code. Two buttons: *Read* opens the reader at the last position, *Download* returns the original file.

**Reader.** PDF.js continuous-scroll reader: every page in one document, rendered as it comes into view, with prev/next, zoom, page input, a Contents drawer from the outline, the format wheel, position memory, and keyboard nav. Logs `opened`, `read`, `dwelled`, `reread` with the section ID and page.

**Professor view.** One course, one term. Roster table: student, last active, sections opened, % of assigned read, time on the book. Click a student for their section-by-section trail. Class rollup: most and least read sections, assigned sections nobody opened, dwell outliers. Data comes from the real ledger joined to the roster, scoped to this instructor's course.

**College view.** Four numbers, drill-down by course: dollars displaced (prior per-course fee × enrolled, from `seed/prior-spend.json`), students active, sections live, term-over-term delta. Empty states are honest. Never a fake number.

---

## Identity in v1

No SSO, no LTI. A dev login picker in Menu: choose a seeded student, the instructor, or the admin. Real tables and real role checks so swapping in LTI/SSO later touches auth only. `student_hash` in the ledger; the roster maps hash to display name and is only readable through instructor-scoped queries.

---

## Done condition

1. `python ingest.py add` writes `sections` for each book; a second run changes zero IDs.
2. Library page → *Download* returns the original file; *Read* opens the reader at the last position.
3. Reading three sections as a seeded student produces events visible in the professor view within one reload.
4. College view shows dollars displaced computed from `prior-spend.json` × roster, plus the seeded prior-term comparison.
5. axe shows no critical issues on the library, reader, professor, and college pages, light and dark.
6. `pip install -r requirements.txt`, `python ingest.py add`, `python server.py` works from a fresh clone with no environment variables set.
7. `docs/PROGRESS.md` says exactly what works and what is next.

---

## After SLC v1

In leverage order: LTI launch from a Canvas sandbox → full-text search → open TTS with sentence sync → render library and first renderers → Canvas gap report → standards review. Each is a separate branch with its own done condition.
