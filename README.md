# Zibili

A Libby-style reader for OpenStax and other OER textbooks. Drop PDFs in `books/`, ingest them, and read in the browser.

```bash
python ingest.py add
python server.py --host 127.0.0.1 --port 5174
```

Open http://localhost:5174

PDFs stay out of git. Ingest writes `data/zibili.db` and linearized copies under `data/files/`.
