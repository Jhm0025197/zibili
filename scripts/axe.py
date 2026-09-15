"""Accessibility check: axe-core over the four pages, light and dark.

    python scripts/axe.py            # against http://127.0.0.1:5174
    ZIBILI_URL=http://127.0.0.1:5199 python scripts/axe.py

Needs the server running with the seeded database, and `pip install
playwright`. Drives an installed Edge or Chrome, so there is nothing else to
download. Exits 1 if any page has a critical or serious violation.

axe-core is vendored at vendor/axe/axe.min.js (MPL-2.0) and injected into the
page by this script only; the app never serves it.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - guidance, not logic
    print("scripts/axe.py needs Playwright: pip install playwright", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
AXE = ROOT / "vendor" / "axe" / "axe.min.js"
BASE = os.environ.get("ZIBILI_URL", "http://127.0.0.1:5174").rstrip("/")

PAGES = [
    ("library", "/index.html", "stu-cho"),
    ("reader", "/read.html?id=introduction-to-philosophy&page=30", "stu-cho"),
    ("instructor", "/instructor.html?course=phil1010-2026sp", "instructor-reyes"),
    ("college", "/college.html", "admin-okafor"),
]
TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
FAIL_ON = {"critical", "serious"}


def launch(playwright):
    for channel in ("msedge", "chrome", "chromium"):
        try:
            return playwright.chromium.launch(channel=channel, headless=True)
        except Exception:  # noqa: BLE001 - try the next browser
            continue
    print("No Edge, Chrome or Chromium found. Install one or run: playwright install chromium", file=sys.stderr)
    sys.exit(2)


def main() -> int:
    if not AXE.is_file():
        print(f"missing {AXE}", file=sys.stderr)
        return 2
    axe_source = AXE.read_text(encoding="utf-8")
    worst = 0
    with sync_playwright() as playwright:
        browser = launch(playwright)
        for scheme in ("light", "dark"):
            context = browser.new_context(color_scheme=scheme, viewport={"width": 1200, "height": 900})
            page = context.new_page()
            for name, path, person in PAGES:
                page.request.post(f"{BASE}/api/session", data={"person_id": person})
                page.goto(f"{BASE}{path}", wait_until="networkidle")
                if name == "reader":
                    page.wait_for_selector(".reader-stage canvas", timeout=30000)
                else:
                    page.wait_for_timeout(600)
                page.add_script_tag(content=axe_source)
                result = page.evaluate(
                    "(tags) => axe.run(document, { runOnly: { type: 'tag', values: tags } })", TAGS
                )
                violations = result["violations"]
                bad = [v for v in violations if v["impact"] in FAIL_ON]
                worst += len(bad)
                status = "FAIL" if bad else "ok  "
                print(f"{status} {name:10s} {scheme:5s} {len(violations)} violation(s), {len(bad)} critical/serious")
                for violation in violations:
                    print(f"     - [{violation['impact']}] {violation['id']}: {violation['help']}")
                    for node in violation["nodes"][:3]:
                        target = ", ".join(node["target"])
                        print(f"         {target[:110]}")
            context.close()
        browser.close()
    print("done:", "no critical or serious issues" if worst == 0 else f"{worst} critical/serious issue(s)")
    return 1 if worst else 0


if __name__ == "__main__":
    sys.exit(main())
