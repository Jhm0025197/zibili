"""Identity for v1.

No SSO and no LTI: a cookie names a seeded person and the server looks them
up. Everything downstream reads roles and course scope from real tables, so
swapping in an LTI launch later replaces this file and nothing else.

The cookie is unsigned. That is fine for a dev login picker on localhost and
is listed in docs/backlog.md as the thing to change before anyone else can
reach the server.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from http.cookies import SimpleCookie
from typing import Any

from errors import APIError
from ledger import student_hash

SESSION_COOKIE = "zibili_person"
COOKIE_MAX_AGE = 30 * 24 * 3600
ROLES = ("student", "instructor", "admin")
COURSE_COLUMNS = "c.id, c.code, c.title, c.term, c.term_label, c.starts_on, c.instructor_id, c.book_id"


@dataclass
class Session:
    person: dict[str, Any]
    course: dict[str, Any] | None
    hash: str | None

    @property
    def role(self) -> str:
        return self.person["role"]

    def to_json(self) -> dict[str, Any]:
        return {"person": public_person(self.person), "course": self.course}


def public_person(row: Any) -> dict[str, Any]:
    return {"id": row["id"], "role": row["role"], "display_name": row["display_name"]}


def list_people(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT id, role, display_name FROM people
        ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'instructor' THEN 1 ELSE 2 END, display_name
        """
    ).fetchall()
    return [public_person(row) for row in rows]


def get_person(connection: sqlite3.Connection, person_id: str) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT id, role, display_name, student_hash FROM people WHERE id = ?", (person_id,)
    ).fetchone()


def course_for(connection: sqlite3.Connection, person: sqlite3.Row) -> dict[str, Any] | None:
    row = None
    if person["role"] == "instructor":
        row = connection.execute(
            f"SELECT {COURSE_COLUMNS} FROM courses c WHERE c.instructor_id = ? ORDER BY c.starts_on DESC LIMIT 1",
            (person["id"],),
        ).fetchone()
    elif person["role"] == "student" and person["student_hash"]:
        row = connection.execute(
            f"""
            SELECT {COURSE_COLUMNS} FROM courses c
            JOIN enrollments e ON e.course_id = c.id
            WHERE e.student_hash = ?
            ORDER BY c.starts_on DESC LIMIT 1
            """,
            (person["student_hash"],),
        ).fetchone()
    return dict(row) if row else None


def parse_cookies(header: str | None) -> dict[str, str]:
    jar: SimpleCookie = SimpleCookie()
    try:
        jar.load(header or "")
    except Exception:  # noqa: BLE001 - a malformed cookie header is not our problem
        return {}
    return {key: morsel.value for key, morsel in jar.items()}


def get_session(connection: sqlite3.Connection, cookie_header: str | None) -> Session | None:
    person_id = parse_cookies(cookie_header).get(SESSION_COOKIE)
    if not person_id:
        return None
    person = get_person(connection, person_id)
    if person is None:
        return None
    digest = person["student_hash"]
    if digest is None and person["role"] == "student":
        digest = student_hash(connection, person["id"])
    return Session(person=dict(person), course=course_for(connection, person), hash=digest)


def require_session(session: Session | None) -> Session:
    if session is None:
        raise APIError(401, "not_signed_in", "Choose someone in Menu to sign in.")
    return session


def require_role(session: Session | None, *roles: str) -> Session:
    session = require_session(session)
    if session.role not in roles:
        who = " or ".join(f"the {role}" for role in roles)
        raise APIError(403, "forbidden", f"This page is for {who}. You are signed in as {session.person['display_name']}.")
    return session


def set_cookie_header(person_id: str | None) -> str:
    if person_id is None:
        return f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
    return f"{SESSION_COOKIE}={person_id}; Path=/; Max-Age={COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax"
