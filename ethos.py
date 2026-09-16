"""Ellucian Ethos: the API in front of Banner.

Two sources produce the same neutral bundle:

- ``EthosClient`` talks to Ethos over HTTPS with an API key (stdlib only).
- ``FixtureSource`` reads JSON files in Ethos shape from a folder, so the
  sync runs and is tested without a key.

Nothing here runs at request time. ``sync.py`` calls it on purpose, from a
terminal or a schedule. The bundle shape is the contract ``sync.py`` works
from; if IT hands over a different interface, this is the one file to swap.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

LOGGER = logging.getLogger("zibili.ethos")

DEFAULT_BASE_URL = "https://integrate.elluciancloud.com"
PAGE_SIZE = 200
RESOURCES = {
    "academic-periods": "application/vnd.hedtech.integration.v16+json",
    "subjects": "application/vnd.hedtech.integration.v6+json",
    "courses": "application/vnd.hedtech.integration.v16+json",
    "sections": "application/vnd.hedtech.integration.v16+json",
    "section-instructors": "application/vnd.hedtech.integration.v10+json",
    "section-registrations": "application/vnd.hedtech.integration.v16+json",
    "persons": "application/vnd.hedtech.integration.v12+json",
}


@dataclass
class Bundle:
    """Everything the sync needs, already in Zibili's terms.

    Keys are Ethos GUIDs. ``sections`` reference ``courses`` and ``terms``;
    ``instructors`` and ``registrations`` reference ``sections`` and
    ``persons``.
    """

    terms: dict[str, dict[str, Any]] = field(default_factory=dict)
    subjects: dict[str, dict[str, Any]] = field(default_factory=dict)
    courses: dict[str, dict[str, Any]] = field(default_factory=dict)
    sections: dict[str, dict[str, Any]] = field(default_factory=dict)
    instructors: list[dict[str, Any]] = field(default_factory=list)
    registrations: list[dict[str, Any]] = field(default_factory=list)
    persons: dict[str, dict[str, Any]] = field(default_factory=dict)


class EthosError(RuntimeError):
    pass


# --- reading Ethos shapes ------------------------------------------------------


def _ref(value: Any) -> str | None:
    if isinstance(value, dict):
        return value.get("id")
    return value if isinstance(value, str) else None


def _title(record: dict[str, Any]) -> str:
    titles = record.get("titles") or []
    for want in ("long", "short"):
        for entry in titles:
            if (entry.get("type") or {}).get("category") == want and entry.get("value"):
                return str(entry["value"])
    for entry in titles:
        if entry.get("value"):
            return str(entry["value"])
    return str(record.get("title") or record.get("description") or "")


def _person_name(record: dict[str, Any]) -> str:
    names = record.get("names") or []
    chosen = None
    for entry in names:
        category = (entry.get("type") or {}).get("category")
        if category == "legal":
            chosen = entry
            break
        if entry.get("preference") == "preferred" and chosen is None:
            chosen = entry
    if chosen is None and names:
        chosen = names[0]
    if not chosen:
        return ""
    if chosen.get("fullName"):
        return str(chosen["fullName"])
    return " ".join(part for part in (chosen.get("firstName"), chosen.get("lastName")) if part)


def _person_banner_id(record: dict[str, Any]) -> str | None:
    for cred in record.get("credentials") or []:
        if cred.get("type") in ("bannerId", "colleaguePersonId", "bannerSourcedId") and cred.get("value"):
            return str(cred["value"])
    return None


def _person_email(record: dict[str, Any]) -> str | None:
    emails = record.get("emails") or []
    for entry in emails:
        if entry.get("preference") == "primary" and entry.get("address"):
            return str(entry["address"])
    for entry in emails:
        if entry.get("address"):
            return str(entry["address"])
    return None


def normalize(raw: dict[str, list[dict[str, Any]]]) -> Bundle:
    """Turn raw Ethos resource lists into a Bundle. Tolerant of missing fields."""
    bundle = Bundle()
    for term in raw.get("academic-periods", []):
        category = (term.get("category") or {}).get("type", "term")
        if category not in ("term", "year"):
            continue
        bundle.terms[term["id"]] = {
            "id": term["id"],
            "code": str(term.get("code") or ""),
            "title": _title(term) or str(term.get("code") or ""),
            "starts_on": str(term.get("startOn") or "")[:10],
            "ends_on": str(term.get("endOn") or "")[:10],
        }
    for subject in raw.get("subjects", []):
        bundle.subjects[subject["id"]] = {
            "id": subject["id"],
            "abbreviation": str(subject.get("abbreviation") or ""),
            "title": _title(subject),
        }
    for course in raw.get("courses", []):
        subject_id = _ref(course.get("subject"))
        subject = bundle.subjects.get(subject_id or "", {})
        bundle.courses[course["id"]] = {
            "id": course["id"],
            "subject": subject.get("abbreviation") or str(course.get("subjectAbbreviation") or ""),
            "number": str(course.get("number") or ""),
            "title": _title(course),
        }
    for section in raw.get("sections", []):
        status = (section.get("status") or {}).get("category", "open")
        bundle.sections[section["id"]] = {
            "id": section["id"],
            "crn": str(section.get("code") or ""),
            "section_number": str(section.get("number") or ""),
            "title": _title(section),
            "term_id": _ref(section.get("academicPeriod")),
            "course_id": _ref(section.get("course")),
            "status": status,
            "starts_on": str(section.get("startOn") or "")[:10],
        }
    for row in raw.get("section-instructors", []):
        section_id = _ref(row.get("section"))
        person_id = _ref(row.get("instructor"))
        if section_id and person_id:
            role = row.get("instructorRole") or {}
            bundle.instructors.append(
                {
                    "section_id": section_id,
                    "person_id": person_id,
                    "primary": bool(row.get("primary") or role.get("primary") or row.get("instructorRoleCategory") == "primary"),
                }
            )
    for row in raw.get("section-registrations", []):
        section_id = _ref(row.get("section"))
        person_id = _ref(row.get("registrant"))
        if not (section_id and person_id):
            continue
        status = (row.get("status") or {}).get("registrationStatus", "registered")
        bundle.registrations.append(
            {"section_id": section_id, "person_id": person_id, "active": status == "registered"}
        )
    for person in raw.get("persons", []):
        bundle.persons[person["id"]] = {
            "id": person["id"],
            "name": _person_name(person),
            "banner_id": _person_banner_id(person),
            "email": _person_email(person),
        }
    return bundle


# --- sources -------------------------------------------------------------------


class FixtureSource:
    """Ethos-shaped JSON files in a folder: one file per resource name."""

    def __init__(self, folder: str | Path) -> None:
        self.folder = Path(folder)
        if not self.folder.is_dir():
            raise EthosError(f"fixture folder not found: {self.folder}")

    def fetch(self, resource: str, **_filters: Any) -> list[dict[str, Any]]:
        path = self.folder / f"{resource}.json"
        if not path.is_file():
            return []
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise EthosError(f"{path} must hold a JSON array")
        return payload

    def bundle(self, term_codes: Iterable[str] | None = None) -> Bundle:
        raw = {name: self.fetch(name) for name in RESOURCES}
        return restrict_to_terms(normalize(raw), term_codes)


class EthosClient:
    """The live Ethos Integration API. Stdlib HTTP, an API key, a JWT."""

    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL, timeout: float = 60.0) -> None:
        if not api_key:
            raise EthosError("no Ethos API key; set ETHOS_API_KEY or pass --api-key")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._token: str | None = None

    def _request(self, method: str, url: str, headers: dict[str, str], body: bytes | None = None) -> tuple[dict[str, str], bytes]:
        request = urllib.request.Request(url, data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310 - https to a configured host
                return {k.lower(): v for k, v in response.headers.items()}, response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            raise EthosError(f"{method} {url} -> {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise EthosError(f"{method} {url} failed: {exc.reason}") from exc

    def token(self) -> str:
        if self._token:
            return self._token
        _, body = self._request("POST", f"{self.base_url}/auth", {"Authorization": f"Bearer {self.api_key}"})
        self._token = body.decode("utf-8").strip().strip('"')
        return self._token

    def fetch(self, resource: str, **filters: Any) -> list[dict[str, Any]]:
        accept = RESOURCES.get(resource, "application/json")
        rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            params = {"limit": PAGE_SIZE, "offset": offset}
            if filters:
                params["criteria"] = json.dumps(filters, separators=(",", ":"))
            url = f"{self.base_url}/api/{resource}?{urllib.parse.urlencode(params)}"
            headers = {"Authorization": f"Bearer {self.token()}", "Accept": accept}
            head, body = self._request("GET", url, headers)
            page = json.loads(body.decode("utf-8")) if body else []
            if not isinstance(page, list):
                raise EthosError(f"{resource}: expected a JSON array")
            rows.extend(page)
            total = int(head.get("x-total-count") or 0)
            offset += len(page)
            if not page or (total and offset >= total) or len(page) < PAGE_SIZE:
                break
        LOGGER.info("ethos: %s -> %d rows", resource, len(rows))
        return rows

    def bundle(self, term_codes: Iterable[str] | None = None) -> Bundle:
        raw: dict[str, list[dict[str, Any]]] = {}
        raw["academic-periods"] = self.fetch("academic-periods")
        wanted_terms = {
            t["id"] for t in raw["academic-periods"] if not term_codes or str(t.get("code")) in set(term_codes)
        }
        sections: list[dict[str, Any]] = []
        for term_id in sorted(wanted_terms):
            sections.extend(self.fetch("sections", academicPeriod={"id": term_id}))
        raw["sections"] = sections
        section_ids = {s["id"] for s in sections}
        course_ids = {_ref(s.get("course")) for s in sections} - {None}
        raw["courses"] = [c for c in self.fetch("courses") if c["id"] in course_ids] if course_ids else []
        raw["subjects"] = self.fetch("subjects")
        instructors: list[dict[str, Any]] = []
        registrations: list[dict[str, Any]] = []
        for section_id in sorted(section_ids):
            instructors.extend(self.fetch("section-instructors", section={"id": section_id}))
            registrations.extend(self.fetch("section-registrations", section={"id": section_id}))
        raw["section-instructors"] = instructors
        raw["section-registrations"] = registrations
        person_ids = {_ref(r.get("instructor")) for r in instructors} | {_ref(r.get("registrant")) for r in registrations}
        person_ids.discard(None)
        persons: list[dict[str, Any]] = []
        for person_id in sorted(person_ids):
            persons.extend(self.fetch("persons", id=person_id))
        raw["persons"] = persons
        return restrict_to_terms(normalize(raw), term_codes)


def restrict_to_terms(bundle: Bundle, term_codes: Iterable[str] | None) -> Bundle:
    if not term_codes:
        return bundle
    wanted = set(term_codes)
    keep_terms = {tid for tid, term in bundle.terms.items() if term["code"] in wanted}
    bundle.terms = {tid: t for tid, t in bundle.terms.items() if tid in keep_terms}
    bundle.sections = {sid: s for sid, s in bundle.sections.items() if s["term_id"] in keep_terms}
    section_ids = set(bundle.sections)
    bundle.instructors = [r for r in bundle.instructors if r["section_id"] in section_ids]
    bundle.registrations = [r for r in bundle.registrations if r["section_id"] in section_ids]
    return bundle
