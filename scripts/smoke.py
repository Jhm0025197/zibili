"""Browser smoke: walk every page as every role and screenshot it.

    python scripts/smoke.py          # against http://127.0.0.1:5174
    ZIBILI_URL=... python scripts/smoke.py

Needs the server running with the seeded database and `pip install
playwright`. Screenshots and report.json land in data/smoke/ (gitignored).
Exits 1 on any page error or unexpected HTTP error.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    print("scripts/smoke.py needs Playwright: pip install playwright", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "smoke"
BASE = os.environ.get("ZIBILI_URL", "http://127.0.0.1:5174").rstrip("/")
BOOK = "introduction-to-philosophy"

STEPS = [
    # (name, person or None, path, selector to wait for, text that must appear)
    ("home-guest", None, "/index.html", ".shelf-card", "Your library"),
    ("list", None, "/list.html?list=all", ".libby-item", "All titles"),
    ("search", None, "/list.html?q=PHI1010", ".libby-item", "Introduction to Philosophy"),
    ("title", None, f"/title.html?id={BOOK}", "[data-chapters]:not([hidden])", "Chapters"),
    ("reader-guest", None, f"/read.html?id={BOOK}&page=20", ".reader-stage canvas", "Reading as a guest"),
    ("menu-picker", None, "/menu.html", ".picker-person", "Prof. Marisol Reyes"),
    ("home-student", "stu-cho", "/index.html", ".shelf-card", "Your library"),
    ("reader-student", "stu-cho", f"/read.html?id={BOOK}&page=30", ".reader-stage canvas", "1.2"),
    ("shelf-student", "stu-cho", "/shelf.html", ".chip-row", "Reading"),
    ("instructor-gate", "stu-cho", "/instructor.html", ".empty-state", "signed in as"),
    ("instructor-fall", "instructor-reyes", "/instructor.html", ".dash-head", "Fall 2026"),
    ("instructor-spring", "instructor-reyes", "/instructor.html?course=phil1010-2026sp", "table.data", "Roster"),
    ("college-gate", "instructor-reyes", "/college.html", ".empty-state", "administration"),
    ("college", "admin-okafor", "/college.html", "table.data", "Term by term"),
    ("mobile-home", None, "/index.html", ".shelf-card", "Your library"),
    ("mobile-reader", None, f"/read.html?id={BOOK}&page=20", ".reader-stage canvas", "of 421"),
]


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report: dict[str, list[str]] = {"notes": [], "console": [], "page_errors": [], "http_errors": []}
    failed = False
    with sync_playwright() as playwright:
        browser = None
        for channel in ("msedge", "chrome", "chromium"):
            try:
                browser = playwright.chromium.launch(channel=channel, headless=True)
                break
            except Exception:  # noqa: BLE001
                continue
        if browser is None:
            print("No browser found. Install Edge or Chrome, or run: playwright install chromium", file=sys.stderr)
            return 2
        desktop = browser.new_context(viewport={"width": 1280, "height": 900})
        mobile = browser.new_context(viewport={"width": 390, "height": 844})
        for context in (desktop, mobile):
            page = context.new_page()
            page.on("console", lambda m: report["console"].append(f"{m.type}: {m.text}") if m.type == "error" else None)
            page.on("pageerror", lambda e: report["page_errors"].append(str(e)))
            page.on(
                "response",
                lambda r: report["http_errors"].append(f"{r.status} {r.url}")
                if r.status >= 400 and "fonts.g" not in r.url
                else None,
            )
            context.page = page  # type: ignore[attr-defined]
        for name, person, path, wait_for, expect in STEPS:
            context = mobile if name.startswith("mobile") else desktop
            page = context.page  # type: ignore[attr-defined]
            if person:
                page.request.post(f"{BASE}/api/session", data={"person_id": person})
            else:
                page.request.delete(f"{BASE}/api/session")
            page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=30000)
            try:
                page.wait_for_selector(wait_for, timeout=20000)
                page.wait_for_timeout(300)
                body = page.inner_text("body")
                ok = expect in body
            except Exception as exc:  # noqa: BLE001
                ok = False
                report["notes"].append(f"{name}: {exc}")
            page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
            status = "ok  " if ok else "FAIL"
            if not ok:
                failed = True
            line = f"{status} {name}: expected {expect!r}"
            print(line)
            report["notes"].append(line)
        browser.close()
    if report["page_errors"] or report["http_errors"] or report["console"]:
        failed = True
    (OUT / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("page errors:", report["page_errors"])
    print("http errors:", report["http_errors"])
    print("console errors:", report["console"])
    print("report:", OUT / "report.json")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
