"""The events ledger: hashing, validation, writes and positions.

The client is not trusted for identity. It says what happened and to which
sections; the server attaches who, which course and which term from the
session. A batch containing one bad event is rejected with a reason rather
than silently half-written. `student_hash` is the only student identifier
that ever reaches the `events` table.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

VERBS = frozenset(
    {
        "assigned",
        "opened",
        "read",
        "dwelled",
        "reread",
        "listened",
        "summarized",
        "infographic",
        "story",
        "card",
        "quiz_attempt",
        "quiz_complete",
        "asked",
        "highlighted",
        "printed",
        "rated",
        "served_cached",
        "generated",
    }
)

CHUNK_ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
MAX_EVENTS_PER_BATCH = 100
MAX_CHUNKS_PER_EVENT = 64
MAX_CHUNK_ID_LENGTH = 96
MAX_PAYLOAD_BYTES = 4096
MAX_CLOCK_DRIFT = timedelta(hours=24)


class InvalidEvent(ValueError):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def parse_iso(value: str) -> datetime:
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    moment = datetime.fromisoformat(text)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment


def new_id() -> str:
    return uuid.uuid4().hex


def salt(connection: sqlite3.Connection) -> str:
    row = connection.execute(
        "SELECT value FROM app_meta WHERE key = 'student_hash_salt'"
    ).fetchone()
    if row is None:
        raise RuntimeError("student_hash_salt is missing; the database was not initialised")
    return row[0]


def student_hash(connection: sqlite3.Connection, person_id: str) -> str:
    digest = hashlib.sha256(f"{salt(connection)}:{person_id}".encode("utf-8")).hexdigest()
    return digest[:32]


@dataclass
class Event:
    verb: str
    book_id: str
    chunk_ids: list[str]
    render_id: str | None
    payload: dict[str, Any]
    occurred_at: datetime


@dataclass
class EventContext:
    student_hash: str
    course_id: str
    instructor_id: str
    term: str


def _check(condition: Any, message: str) -> None:
    if not condition:
        raise InvalidEvent(message)


def validate(raw: Any, index: int, now: datetime | None = None) -> Event:
    where = f"event {index}"
    now = now or utc_now()
    _check(isinstance(raw, dict), f"{where}: not an object")

    verb = raw.get("verb")
    _check(isinstance(verb, str), f"{where}: verb must be a string")
    _check(verb in VERBS, f'{where}: unknown verb "{verb}"')

    book_id = raw.get("book_id")
    _check(isinstance(book_id, str) and CHUNK_ID_RE.match(book_id), f"{where}: bad book_id")

    chunk_ids = raw.get("chunk_ids")
    _check(isinstance(chunk_ids, list), f"{where}: chunk_ids must be an array")
    _check(len(chunk_ids) > 0, f"{where}: chunk_ids is empty")
    _check(len(chunk_ids) <= MAX_CHUNKS_PER_EVENT, f"{where}: more than {MAX_CHUNKS_PER_EVENT} chunk_ids")
    for chunk_id in chunk_ids:
        _check(
            isinstance(chunk_id, str) and len(chunk_id) <= MAX_CHUNK_ID_LENGTH and CHUNK_ID_RE.match(chunk_id),
            f"{where}: bad chunk id {json.dumps(chunk_id)}",
        )

    render_id = raw.get("render_id")
    _check(render_id is None or (isinstance(render_id, str) and len(render_id) <= 64), f"{where}: bad render_id")

    payload = raw.get("payload", {})
    _check(isinstance(payload, dict), f"{where}: payload must be an object")
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    _check(len(encoded.encode("utf-8")) <= MAX_PAYLOAD_BYTES, f"{where}: payload over {MAX_PAYLOAD_BYTES} bytes")

    occurred_at = now
    if "occurred_at" in raw and raw["occurred_at"] is not None:
        _check(isinstance(raw["occurred_at"], str), f"{where}: occurred_at must be a string")
        try:
            occurred_at = parse_iso(raw["occurred_at"])
        except ValueError as exc:
            raise InvalidEvent(f"{where}: occurred_at is not a date") from exc
        _check(abs(now - occurred_at) <= MAX_CLOCK_DRIFT, f"{where}: occurred_at is more than a day from now")

    return Event(
        verb=verb,
        book_id=book_id,
        chunk_ids=list(chunk_ids),
        render_id=render_id,
        payload=payload,
        occurred_at=occurred_at,
    )


def validate_batch(raw: Any, now: datetime | None = None) -> list[Event]:
    _check(isinstance(raw, dict), "body must be an object")
    events = raw.get("events")
    _check(isinstance(events, list), "body.events must be an array")
    _check(len(events) > 0, "body.events is empty")
    _check(len(events) <= MAX_EVENTS_PER_BATCH, f"more than {MAX_EVENTS_PER_BATCH} events in one batch")
    return [validate(item, index, now) for index, item in enumerate(events)]


def write_events(
    connection: sqlite3.Connection,
    events: list[Event],
    context: EventContext,
    *,
    seeded: bool = False,
    received_at: str | None = None,
) -> int:
    received = received_at or iso(utc_now())
    connection.executemany(
        """
        INSERT INTO events (
            id, student_hash, course_id, instructor_id, term, book_id,
            chunk_ids, render_id, verb, payload, occurred_at, received_at, seeded
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                new_id(),
                context.student_hash,
                context.course_id,
                context.instructor_id,
                context.term,
                event.book_id,
                json.dumps(event.chunk_ids, separators=(",", ":")),
                event.render_id,
                event.verb,
                json.dumps(event.payload, ensure_ascii=False, separators=(",", ":")),
                iso(event.occurred_at),
                received,
                1 if seeded else 0,
            )
            for event in events
        ],
    )
    return len(events)


def upsert_position(
    connection: sqlite3.Connection,
    student_hash_value: str,
    book_id: str,
    page: int,
    section_id: str | None,
) -> None:
    connection.execute(
        """
        INSERT INTO positions (student_hash, book_id, page, section_id, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (student_hash, book_id) DO UPDATE SET
            page = excluded.page,
            section_id = excluded.section_id,
            updated_at = excluded.updated_at
        """,
        (student_hash_value, book_id, page, section_id, iso(utc_now())),
    )


def latest_position_in(events: list[Event]) -> tuple[str, int, str | None] | None:
    """The newest event in a batch that carries an integer page, if any."""
    best: Event | None = None
    for event in events:
        page = event.payload.get("page")
        if isinstance(page, bool) or not isinstance(page, int) or page < 1:
            continue
        if best is None or event.occurred_at >= best.occurred_at:
            best = event
    if best is None:
        return None
    section_id = best.chunk_ids[0] if best.chunk_ids else None
    return best.book_id, int(best.payload["page"]), section_id


def read_position(connection: sqlite3.Connection, student_hash_value: str, book_id: str) -> dict[str, Any] | None:
    row = connection.execute(
        "SELECT page, section_id, updated_at FROM positions WHERE student_hash = ? AND book_id = ?",
        (student_hash_value, book_id),
    ).fetchone()
    if row is None:
        return None
    return {"page": row["page"], "section_id": row["section_id"], "updated_at": row["updated_at"]}


def opened_sections(connection: sqlite3.Connection, student_hash_value: str, book_id: str) -> list[str]:
    rows = connection.execute(
        """
        SELECT DISTINCT json_extract(chunk_ids, '$[0]') AS chunk_id
        FROM events
        WHERE student_hash = ? AND book_id = ? AND verb = 'opened'
        """,
        (student_hash_value, book_id),
    ).fetchall()
    return [row["chunk_id"] for row in rows if row["chunk_id"]]
