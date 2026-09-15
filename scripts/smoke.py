"""Browser smoke: walk every page as every role and screenshot it.

    python scripts/smoke.py          # against http://127.0.0.1:5174
    ZIBILI_URL=... python scripts/smoke.py

Needs the server running with the seeded database and `pip install
playwright`. Screenshots and report.json land in data/smoke/ (gitignored).
Exits 1 on any page error, unexpected HTTP error, or failed step.
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
CANVAS = ".reader-page canvas"
PAGE_INPUT = "[data-page-input]"


def scroll_to_page(page, number: int) -> None:
    page.evaluate(
        "(n) => document.querySelector(`.reader-page[data-page='${n}']`).scrollIntoView({block: 'start', behavior: 'instant'})",
        number,
    )


def wait_for_page(page, number: int) -> None:
    page.wait_for_function("(n) => document.querySelector('[data-page-input]').value === String(n)", arg=number, timeout=15000)


def act_scroll(page, notes: list[str]) -> bool:
    scroll_to_page(page, 30)
    wait_for_page(page, 30)
    page.wait_for_url("**page=30**", timeout=5000)
    page.wait_for_selector(".reader-page[data-page='30'] canvas", timeout=15000)
    count = page.evaluate("document.querySelectorAll('.reader-page canvas').length")
    notes.append(f"rendered canvases after scrolling: {count}")
    return count <= 12


def act_contents(page, notes: list[str]) -> bool:
    outline = page.request.get(f"{BASE}/api/books/{BOOK}/sections").json()
    target = next(s for c in outline["chapters"] for s in c["sections"] if s["number"] == "2.1")
    page.click("[data-contents]")
    page.wait_for_selector(".sheet--toc")
    page.click(f".sheet--toc [data-goto='{target['start_page']}']")
    wait_for_page(page, target["start_page"])
    page.wait_for_function("document.querySelector('[data-crumb]').textContent.startsWith('2.1')", timeout=5000)
    notes.append(f"contents jumped to page {target['start_page']} and the crumb reads {page.inner_text('[data-crumb]')!r}")
    return True


def act_format(page, notes: list[str]) -> bool:
    posted = []
    handler = lambda r: posted.append(r.url) if r.method == "POST" and "/api/events" in r.url else None  # noqa: E731
    page.on("request", handler)
    page.click("[data-fab='wheel']")
    page.wait_for_selector(".wheel:not([hidden])")
    focused = page.evaluate("document.activeElement && document.activeElement.dataset.id")
    page.keyboard.press("ArrowRight")
    moved = page.evaluate("document.activeElement && document.activeElement.dataset.id")
    centre = page.inner_text(".wheel-center")
    page.keyboard.press("Enter")
    page.wait_for_selector(".sheet")
    text = page.inner_text(".sheet")
    page.keyboard.press("Escape")
    page.wait_for_selector(".sheet-scrim", state="detached", timeout=5000)
    wheel_hidden = page.evaluate("document.querySelector('.wheel').hidden")
    page.click("[data-fab='wheel']")
    page.wait_for_selector(".wheel:not([hidden])")
    page.keyboard.press("Escape")
    back = page.evaluate("document.activeElement && document.activeElement.dataset.fab")
    page.wait_for_timeout(1500)
    page.remove_listener("request", handler)
    notes.append(
        f"wheel: opened on {focused!r}, arrow moved to {moved!r}, centre read {centre.splitlines()[0]!r}, "
        f"sheet says not in v1: {'Not in v1' in text}, wheel closed after pick: {wheel_hidden}, escape returned focus to {back!r}, events posted: {len(posted)}"
    )
    return focused == "read" and moved == "listen" and "Not in v1" in text and wheel_hidden and back == "wheel" and not posted


def act_tools(page, notes: list[str]) -> bool:
    page.evaluate("localStorage.removeItem('zibili-reading-tools')")
    page.click("[data-fab='tools']")
    page.wait_for_selector(".sheet--tools")
    page.click(".sheet--tools [data-zoom='1']")
    page.wait_for_timeout(600)
    zoom_text = page.inner_text(".sheet--tools output")
    page.click(".sheet--tools [data-set='tint'][data-value='sepia']")
    tint = page.evaluate("document.querySelector('.reader').dataset.tint")
    page.click(".sheet--tools [data-set='theme'][data-value='dark']")
    theme = page.evaluate("document.documentElement.dataset.theme")
    page.click(".sheet--tools [data-toggle='ruler']")
    ruler = page.evaluate("Boolean(document.querySelector('.reading-ruler'))")
    page.click(".sheet--tools [data-toggle='focus']")
    page.wait_for_timeout(400)
    rail_hidden = page.evaluate("getComputedStyle(document.querySelector('.libby-rail')).display === 'none'")
    page.keyboard.press("Escape")
    page.wait_for_selector(".sheet-scrim", state="detached", timeout=5000)
    saved = page.evaluate("JSON.parse(localStorage.getItem('zibili-reading-tools'))")
    page.reload(wait_until="networkidle")
    page.wait_for_selector(CANVAS, timeout=20000)
    kept = page.evaluate("[document.documentElement.dataset.theme, document.querySelector('.reader').dataset.tint, Boolean(document.querySelector('.reading-ruler'))]")
    # leave the browser as we found it
    page.evaluate("localStorage.removeItem('zibili-reading-tools')")
    page.reload(wait_until="networkidle")
    notes.append(f"tools: zoom {zoom_text}, tint {tint}, theme {theme}, ruler {ruler}, focus hid rail {rail_hidden}, saved {saved}, after reload {kept}")
    return zoom_text == "115%" and tint == "sepia" and theme == "dark" and ruler and rail_hidden and kept == ["dark", "sepia", True]


def act_reload(page, notes: list[str]) -> bool:
    scroll_to_page(page, 40)
    wait_for_page(page, 40)
    page.wait_for_url("**page=40**", timeout=5000)
    page.reload(wait_until="networkidle")
    page.wait_for_selector(".reader-page[data-page='40'] canvas", timeout=20000)
    value = page.input_value(PAGE_INPUT)
    notes.append(f"after reload the page box reads {value}")
    return value == "40"


def act_wheel(page, notes: list[str]) -> bool:
    before = int(page.input_value(PAGE_INPUT))
    page.mouse.move(200, 500)
    page.mouse.wheel(0, 3000)
    page.wait_for_timeout(1200)
    after = int(page.input_value(PAGE_INPUT))
    notes.append(f"mouse wheel moved the page from {before} to {after}")
    return after > before


STEPS = [
    # (name, person or None, path, selector to wait for, text that must appear, optional action)
    ("home-guest", None, "/index.html", ".shelf-card", "Your library"),
    ("list", None, "/list.html?list=all", ".libby-item", "All titles"),
    ("search", None, "/list.html?q=PHI1010", ".libby-item", "Introduction to Philosophy"),
    ("title", None, f"/title.html?id={BOOK}", "[data-chapters]:not([hidden])", "Chapters"),
    ("reader-guest", None, f"/read.html?id={BOOK}&page=20", CANVAS, "Reading as a guest"),
    ("reader-scroll", None, f"/read.html?id={BOOK}&page=20", ".reader-page[data-page='20'] canvas", "of 421", act_scroll),
    ("reader-format", None, f"/read.html?id={BOOK}&page=20", CANVAS, "of 421", act_format),
    ("reader-tools", None, f"/read.html?id={BOOK}&page=20", CANVAS, "of 421", act_tools),
    ("reader-reload", None, f"/read.html?id={BOOK}&page=20", CANVAS, "of 421", act_reload),
    ("menu-picker", None, "/menu.html", ".picker-person", "Prof. Marisol Reyes"),
    ("home-student", "stu-cho", "/index.html", ".shelf-card", "Your library"),
    ("reader-student", "stu-cho", f"/read.html?id={BOOK}&page=30", CANVAS, "1.2"),
    ("reader-contents", "stu-cho", f"/read.html?id={BOOK}&page=30", CANVAS, "1.2", act_contents),
    ("shelf-student", "stu-cho", "/shelf.html", ".chip-row", "Reading"),
    ("instructor-gate", "stu-cho", "/course", ".libby-notice", "Not found"),
    ("instructor-fall", "instructor-reyes", "/course", ".dash-head", "Fall 2026"),
    ("instructor-spring", "instructor-reyes", "/course?course=phil1010-2026sp", "table.data", "Roster"),
    ("college-gate", "instructor-reyes", "/admin", ".libby-notice", "Not found"),
    ("college", "admin-okafor", "/admin", "table.data", "Term by term"),
    ("mobile-home", None, "/index.html", ".shelf-card", "Your library"),
    ("mobile-reader", None, f"/read.html?id={BOOK}&page=20", CANVAS, "of 421"),
    ("mobile-scroll", None, f"/read.html?id={BOOK}&page=20", CANVAS, "of 421", act_wheel),
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
        for step in STEPS:
            name, person, path, wait_for, expect = step[:5]
            act = step[5] if len(step) > 5 else None
            context = mobile if name.startswith("mobile") else desktop
            page = context.page  # type: ignore[attr-defined]
            if person:
                page.request.post(f"{BASE}/api/session", data={"person_id": person})
            else:
                page.request.delete(f"{BASE}/api/session")
            marks = {key: len(report[key]) for key in ("console", "page_errors", "http_errors")}
            page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=30000)
            try:
                page.wait_for_selector(wait_for, timeout=20000)
                page.wait_for_timeout(300)
                ok = expect in page.inner_text("body")
                if act is not None:
                    ok = act(page, report["notes"]) and ok
            except Exception as exc:  # noqa: BLE001
                ok = False
                report["notes"].append(f"{name}: {exc}")
            if expect == "Not found":
                # A page that is meant to 404 is not an error; drop what it logged.
                for key, mark in marks.items():
                    del report[key][mark:]
            page.screenshot(path=str(OUT / f"{name}.png"), full_page="reader" not in name and "scroll" not in name)
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
    for note in report["notes"]:
        if not note.startswith(("ok  ", "FAIL")):
            print("   ", note)
    print("page errors:", report["page_errors"])
    print("http errors:", report["http_errors"])
    print("console errors:", report["console"])
    print("report:", OUT / "report.json")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
