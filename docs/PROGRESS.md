# Progress

What works, what is next. Updated at the end of every phase.

## Phase 1: honest app (done)

- The catalog comes only from `/api/catalog`. When the server is down the pages say so. No fake titles anywhere.
- Borrow, holds, samples, audiobook copy, and the fake sign-in are gone. Read, Download, and Tag remain.
- Every page paints a loading shell before the catalog request, and has a favicon.
- Reader ignores arrow keys while the page input has focus.
- Dead Oakland Public Library CSS removed; colours route through `--libby-*` variables.
- `requirements.txt`, `npm test`, and these docs exist.

## Phase 2: sections from the outline (done)

- `python ingest.py add` reads each PDF's outline into a `sections` table. Numbered level-1 entries are chapters, level-2 entries are sections. IDs are `{book}-ch{NN}-s{NN}`, persisted in `books/id-map.json`. A second run mints zero IDs. Removed sections are tombstoned.
- Books ingested before this phase get their sections backfilled on the next `ingest.py add` without re-copying the PDF.
- Both shipped books have complete two-level outlines: Introduction to Philosophy has 136 sections in 12 chapters, Business Law I Essentials has 88 in 14. A PDF with no outline becomes one "Whole book" section and the reader says so.
- `GET /api/books/{id}/sections` returns the chapter tree. The reader shows the current section under the toolbar and has a Contents drawer that jumps to any section. The title page lists chapters.
- Schema is now version 2 and already contains the ledger tables (people, courses, enrollments, assignments, prior_spend, events, positions) so later phases add no DDL.

## Next

Phase 3: seeded people and course, dev login picker, cookie session, role checks.
