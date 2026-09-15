# books/

Drop OpenStax (or other OER) PDFs here. The PDFs stay out of git.

Optional sidecar: a `.json` file next to the PDF with the same stem, for title, author, course codes, subjects, and license. See the two that are here.

```bash
python ingest.py add
python server.py
```

Ingest copies each file into `data/files/`, renders a cover, reads the PDF outline into the `sections` table, and writes `data/zibili.db`. Section IDs live in `id-map.json` in this folder and are committed, so a re-ingest never renumbers a section. The HTTP server never reads this folder.
