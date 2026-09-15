# Backlog

One line per thing that is out of scope for SLC v1. Anything here is a deliberate omission, not an oversight.

## Deferred from SLC v1

- Borrow, holds, and loan periods: removed. Open textbooks have no copy limits. Add back only if a licensed title ever enters the catalog.
- Audiobook and sample formats: removed. Every title is a PDF.
- Printed page labels: the reader and ledger use physical page indices; showing the book's printed page number needs `pdf.getPageLabels()`.
- Full-text search: only title, author, subject, and course code are searched. SQLite FTS5 over extracted page text is the next step.
- Highlights and paragraph anchors.
- Markdown chunking and per-section HTML rendering: the reader shows PDF pages, sections come from the outline.
- EPUB and CNXML ingest adapters.
- Multi-course, multi-book seeding: one course, one book.
- Signed session cookie and CSRF token: v1 dev login sets an unsigned cookie on localhost.
- LTI 1.3 launch from Canvas; SSO.
- Real LRS export (xAPI).
- AI chat sidecar, TTS, format wheel, render library.
- Instructor-authored assignments: the assignment set is seeded.
- Program/department tier in the college drill-down.
- Postgres migration.
- Rate limiting on POST /api/events.
- Offline (service worker) support and self-hosted fonts.
- Dark-mode inversion of the PDF canvas.
