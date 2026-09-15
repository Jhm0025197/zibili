# Progress

What works, what is next. Updated at the end of every phase.

## Phase 1: honest app (done)

- The catalog comes only from `/api/catalog`. When the server is down the pages say so. No fake titles anywhere.
- Borrow, holds, samples, audiobook copy, and the fake sign-in are gone. Read, Download, and Tag remain.
- Every page paints a loading shell before the catalog request, and has a favicon.
- Reader ignores arrow keys while the page input has focus.
- Dead Oakland Public Library CSS removed; colours route through `--libby-*` variables.
- `requirements.txt`, `npm test`, and these docs exist.

## Next

Phase 2: sections from the PDF outline, schema v2, Contents drawer in the reader.
