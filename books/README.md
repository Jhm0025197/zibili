# books/

Drop OpenStax (or other OER) PDFs here. The PDFs stay out of git.

Optional sidecar: a `.json` file next to the PDF with the same stem, for title, author, course codes, and license.

```bash
python ingest.py add
python server.py --host 127.0.0.1 --port 5174
```

Ingest copies linearized files into `data/files/` and writes `data/zibili.db`. The HTTP server never reads this folder.
