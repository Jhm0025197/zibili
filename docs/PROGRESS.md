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

## Phase 3: identity and seeding (done)

- On first run the database seeds an admin, an instructor, 25 synthetic students, two terms of PHIL 1010, enrollments, and a placeholder prior-spend fee from `seed/`. Once the book's sections exist, each course gets the numbered sections of chapters 1 to 5 as assignments and the prior term gets a synthetic reading history (about 17,500 events, all marked `seeded = 1`). The current term starts empty.
- Students appear in the ledger only as a salted 32-character hash. The salt is generated once per database.
- Menu is the dev login picker: pick a person, no password. `POST /api/session` sets an httpOnly cookie; `GET /api/session` reports who is signed in and their course; `DELETE /api/session` signs out. The rail shows a Course tab for the instructor and a College tab for the admin.
- The server accepts POST and DELETE with a 256 KB body cap, and every role-gated route will use `require_role` from `session.py`.

## Phase 4: the reader writes the ledger (done)

- A signed-in student's reader logs `opened` when a section comes on screen, `reread` if they had opened it before, `dwelled` every 15 seconds while the tab is visible, and `read` once they reach the section's last page having spent at least a quarter of the estimated reading time on it. Events carry the section ID and page.
- Events batch in the browser (4 seconds or 20 events) and post fire-and-forget to `POST /api/events`; the queue goes out through `sendBeacon` when the tab hides. A failed post drops events and never stalls the reader.
- The server attaches identity from the session, validates every event, writes the batch in one transaction, and updates the student's position from the newest event carrying a page. Guests keep their page in localStorage; instructors and admins see a note that reading is not recorded.
- Reopening a book lands on the last page. The shelf's Reading tab, the home page's Continue reading shelf, and the title page's Continue button all read from `GET /api/me/positions` and `GET /api/books/{id}/progress`.

## Phase 5: the professor view (done)

- `instructor.html` shows the signed-in instructor's course: four totals, the roster (student, last active, sections opened, assigned read with a meter, time on the book), the most and least read assigned sections, assigned sections nobody has opened, and students whose time on the book is far from the class median. A term switcher moves between Spring 2026 (seeded history) and Fall 2026 (empty until someone reads).
- Clicking a student opens their section-by-section trail.
- Every query behind it takes the instructor's id and filters the course by it in SQL; the roster query is the only place a hash becomes a name. Students and admins see an honest message instead.
- Routes: `GET /api/instructor/roster`, `GET /api/instructor/students/{hash}`, both gated by `require_role("instructor")`.

## Phase 6: the college view (done)

- `college.html`, admin only: dollars displaced (labelled an estimate until `seed/prior-spend.json` says `verified: true`), students active, sections live, and change since the previous term with a caveat while the current term is under three weeks old. A term-by-term table and a by-course table follow.
- `GET /api/college/summary` returns aggregates only. A test asserts the response contains no student hash and no student name.

## Next

Phase 7: dark mode, accessibility check, tooling, docs, push.
