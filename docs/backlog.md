# Backlog

One line per thing that is out of scope for SLC v1. Anything here is a deliberate omission, not an oversight.

## Deferred from SLC v1

- Borrow, holds, and loan periods: removed. Open textbooks have no copy limits. Add back only if a licensed title ever enters the catalog.
- Audiobook and sample formats: removed. Every title is a PDF.
- Printed page labels: the reader and ledger use physical page indices; showing the book's printed page number needs `pdf.getPageLabels()`.
- Section retitles: the id-map keys on the title, so a renamed section reads as delete plus insert. Content matching would keep the ID.
- Full-text search: only title, author, subject, and course code are searched. SQLite FTS5 over extracted page text is the next step.
- Highlights and paragraph anchors.
- Markdown chunking and per-section HTML rendering: the reader shows PDF pages, sections come from the outline (see `docs/decisions/0001-pdf-sections-not-chunks.md`).
- Dark-mode inversion of the PDF canvas: the page keeps the document's own colours.
- EPUB and CNXML ingest adapters.
- Multi-course, multi-book seeding: one course, one book. The second ingested book is in the library but not attached to a course.
- Signed session cookie and CSRF token: v1 dev login sets an unsigned cookie on localhost. Do this before the server is reachable from anywhere else.
- Rate limiting on POST /api/events.
- Instructor-authored assignments: the assignment set is seeded.
- Real prior-spend figure: `seed/prior-spend.json` is a placeholder and the college view labels it an estimate until `verified` is true.
- LTI 1.3 launch from Canvas; SSO.
- Real LRS export (xAPI): events are shaped for it but nothing emits statements.
- Format renderers and the render library: the wheel (Read · Listen · Summary · Infographic · Story · Cards · Quiz · Ask) is in the reader and every format except Read says it is not in v1. No verb is logged for those taps; add a `requested` verb if demand data is ever wanted. The AI chat sidecar (Ask) and TTS (Listen) sit behind the same wheel.
- Program/department tier in the college drill-down.
- Postgres migration: the schema is Postgres-shaped but runs on SQLite.
- Offline (service worker) support and self-hosted fonts: Google Fonts is the one runtime network call.
- JavaScript unit tests: the browser is covered by `scripts/smoke.py` and `scripts/axe.py`, not by a JS test runner.
