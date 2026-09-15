# ADR 0001: Sections come from the PDF outline, not from markdown chunks

- **Status:** accepted
- **Date:** 2026-09-15
- **Applies to:** `sections.py`, `ingest.py`, the `sections` table, every ledger query

## Context

The Octavo spec describes a content model where each book is converted to one markdown file per section, with permanent IDs, and every renderer and every event joins on those IDs. A separate Next.js build did exactly that for one book. This build stays on the vanilla HTML/JS + Python stack and keeps the PDF as the thing students read.

The ledger, assignments, and both dashboards still need a stable unit smaller than a book. Page numbers are too fine and not meaningful to a professor; chapters are too coarse.

## Decision

A section is one entry in the PDF's outline under a numbered chapter. Ingest reads the outline with PyMuPDF and writes one row per section with a start page, an end page, a word count, and the chapter it belongs to.

- IDs are `{book}-ch{NN}-s{NN}`, the same shape the spec uses, so the ledger schema keeps its `chunk_ids` column name and values are section IDs.
- IDs are minted once and persisted in `books/id-map.json`, keyed on the chapter number plus the normalised section title. Re-ordering keeps every ID; re-ingesting an unchanged file mints nothing; a section that disappears is tombstoned and its number is never reused.
- Numbered sections take their printed number (`1.3` becomes `s03`); unnumbered entries such as Summary and Key Terms take the next free number after the numbered ones, so printed and minted numbers agree wherever a printed number exists.
- Unnumbered top-level entries (Contents, Preface, Index) are omitted and recorded. A PDF with no outline becomes one "Whole book" section; one with only chapters becomes one section per chapter. Both cases are surfaced in the reader and in ingest's log.
- Pages are 1-based physical indices, the same numbers PDF.js uses, so an event's `page` and a position's `page` need no translation.

The reader tracks the section on screen by page range. `opened`, `reread`, `dwelled`, and `read` carry the section ID and the page, and the student's position is updated from the newest event in each batch that carries a page.

## Consequences

- Both shipped OpenStax PDFs have complete two-level outlines, so this yields the same granularity the markdown build had (136 sections in Philosophy against its 137).
- Retitling a section reads as a delete plus an insert. Matching on content would be needed to keep the ID across a retitle. Backlog.
- Nothing in the app depends on extracted text, so there is no full-text search yet. FTS5 over per-page text is the natural next step.
- Printed page labels are not used. The book's own page numbers differ from physical indices by the front matter; showing them is a backlog item.
- Swapping the PDF reader for a markdown reader later would change the reader and ingest, not the ledger or the dashboards, because everything joins on the section ID.
