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

- The college view lives in its own window at `/admin` (`admin.html`, `js/admin.js`) with its own shell: no Library, Shelf or Search, nothing student-facing. The server serves that page only to a signed-in admin; everyone else, signed out or not, gets the same not-found as a file that does not exist. It is not linked from the student app; an admin reaches it from Menu. Dollars displaced (labelled an estimate until `seed/prior-spend.json` says `verified: true`), students active, sections live, and change since the previous term with a caveat while the current term is under three weeks old. A term-by-term table and a by-course table follow.
- `GET /api/college/summary` returns aggregates only. A test asserts the response contains no student hash and no student name.

## Phase 7: accessibility, dark mode, tooling, docs (done)

- Dark mode follows the system setting through the `--libby-*` variables. The PDF page keeps the book's own colours.
- Every page has a skip link, one `<main>`, a visible focus ring, `aria-current` on the active tab, and sheets that close on Escape and return focus.
- `npm run axe` runs axe-core (vendored, MPL-2.0, never served) over the library, reader, course, and college pages in light and dark with the WCAG 2.1 AA tags. Result at the end of this phase: zero violations on all eight page-and-theme combinations.
- `npm run smoke` walks sixteen page-and-role combinations, desktop and mobile, screenshots each, and fails on any page or HTTP error.
- README, backlog, and `docs/decisions/0001-pdf-sections-not-chunks.md` describe the build as it is.

## Phase 8: continuous reader and the format wheel (done)

- The reader is one long scroll: a placeholder per page sized before anything is drawn, pages rendered as they come into view, at most twelve kept rendered. The page number, section line, URL, and saved position follow the scroll. Prev, Next, the page box, arrow keys, and the Contents drawer still jump. Zoom keeps the page. A fast fling logs one `opened` for where you stop, not one per section passed.
- The format wheel (Read · Listen · Summary · Infographic · Story · Cards · Quiz · Ask) opens from a round button at the bottom right as a dial: the eight formats around a ring, the name of the one you are on in the centre. Arrow keys walk the ring, Escape closes it. Read is current. Each other format opens a sheet that says in one sentence what it would do and that it is not in v1. Nothing is logged for those taps.
- Next to it, Reading tools: text size, page colour (normal, sepia, dark page), theme (system, light, dark), a reading ruler that follows the pointer, and a focus mode that hides the navigation. Settings stay in this browser, apply before first paint on every page, and are never sent anywhere.

## Done condition, checked

1. Ingest twice, zero ID churn: yes. `books/id-map.json` is byte-identical after a re-ingest and after `--force`.
2. Download returns the original; Read opens at the last position: yes.
3. Reading three sections as a seeded student shows in the professor view on reload: yes, covered by a route test and by hand.
4. College view computes dollars displaced from `prior-spend.json` times the roster, with the seeded prior term beside it: yes, labelled as an estimate.
5. axe shows no critical issues on the four pages, both themes: yes, zero violations of any severity.
6. Fresh clone runs with `pip install -r requirements.txt`, `python ingest.py add`, `python server.py` and no environment variables: yes.
7. This file says what works and what is next: yes.

## Known limits

- One course and one book are seeded. Business Law is in the library but attached to no course, so nothing about it reaches the dashboards.
- The dev login cookie is unsigned. Fine on localhost, not beyond it.
- The fee in `seed/prior-spend.json` is a placeholder; the college view says so until `verified` is set.
- Page numbers are physical indices, not the book's printed page labels.
- Google Fonts is the one runtime network call. Offline, the app falls back to system fonts.
- The format wheel is an interface only. Every format except Read says so.
- Reading tools resize the book, not the app around it. For larger menus and labels use the browser's own zoom, which every page respects.

## Next

In leverage order, each on its own branch: LTI 1.3 launch from a Canvas sandbox, full-text search over page text, printed page labels, a second seeded course on the Business Law book, then the format renderers with Quiz first.
