# Zibili

An internal replacement for BibliU. Open textbooks, read in the browser or downloaded, with a ledger of what students actually read, a professor view, and a college view. One book, one course, three views, zero running cost.

Plain HTML, CSS, and JavaScript. Python 3.11 standard library server. SQLite. No build step, no API keys, no environment variables.

## Run it

```bash
pip install -r requirements.txt      # PyMuPDF, for ingest
python ingest.py add                 # books/*.pdf -> catalog, sections, seed data
python server.py                     # http://127.0.0.1:5174
```

Drop OpenStax (or other OER) PDFs in `books/` before ingesting. An optional `.json` sidecar next to each PDF carries title, author, course codes, subjects, and license. PDFs stay out of git; `data/` holds the database and the served copies.

`npm test` runs the Python test suite. `npm run dev` starts the server.

## Who you can be

There is no password. Open **Menu** and pick a seeded person:

| Person | Sees |
|---|---|
| Any of the 25 students | Library, reader, shelf. Their reading is recorded. |
| Prof. Marisol Reyes | Everything a student sees, plus **Course**: the roster and who read what. |
| Dana Okafor | Everything a guest sees, plus **College**: dollars displaced and engagement per term. |

Signed-out visitors can read and download but nothing is recorded. All people, the course, and the prior term's reading history are synthetic, from `seed/`.

## The four views

- **Library** (`index.html`, `list.html`, `title.html`): shelves, search by title, author, subject, or course code, and a title page with chapters, Read, Download, and Tag.
- **Reader** (`read.html`): PDF.js continuous-scroll reader with a Contents drawer from the book's outline, a pop-up format wheel (Read works; the other seven say they are not in v1), Reading tools (text size, page colour, theme, reading ruler, focus mode), position memory, and keyboard paging. For a signed-in student it logs `opened`, `reread`, `dwelled`, and `read` per section.
- **Course** (`instructor.html`): roster with last active, sections opened, percent of assigned read, and time on the book. Click a student for their trail. Most and least read sections, untouched assignments, dwell outliers.
- **College** (`college.html`): dollars displaced (labelled an estimate until the fee in `seed/prior-spend.json` is verified), students active, sections live, and term-over-term change.

## How it fits together

- `ingest.py` copies each PDF, renders a cover, and reads the PDF outline into a `sections` table. Section IDs are `{book}-ch{NN}-s{NN}` and live in `books/id-map.json`, so a re-ingest never renumbers. `sections.py` holds the rules.
- `server.py` serves the pages, the catalog, the PDF (with range requests), the outline, the session, the events ledger, and the two dashboards. `library.py` owns the schema.
- `ledger.py` validates and writes events. Students appear in the ledger only as a salted hash; the hash-to-name join lives in `queries.py` and only runs for the instructor who owns the course.
- `seed.py` fills an empty database on first run.
- `js/` is one module per page plus `chrome.js` (shell), `data.js` (catalog), `session.js` (who is signed in), and `ledger.js` (the event batcher).

## Checks

```bash
npm test                     # unit and route tests
pip install playwright       # once, for the two scripts below (uses installed Edge or Chrome)
npm run smoke                # walk every page as every role; screenshots in data/smoke/
npm run axe                  # WCAG 2.1 AA check on the four pages, light and dark
```

## Docs

`docs/SLC-v1.md` says what done means. `docs/PROGRESS.md` says what works and what is next. `docs/backlog.md` lists what was deliberately left out. `docs/decisions/` records the choices that would be surprising later.
