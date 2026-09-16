# ADR 0002: Banner reaches Zibili through a pull sync, not at request time

- **Status:** accepted
- **Date:** 2026-09-16
- **Applies to:** `ethos.py`, `sync.py`, schema v3, the student home page, the course window

## Context

Students need the books for the sections they are registered in, and instructors need every section they teach with its roster, all from Banner. The college exposes Banner through the Ellucian Ethos Integration API, which needs an API key from IT and returns sections, section-instructors, section-registrations, courses, subjects, academic-periods, and persons.

Zibili's rules: zero cost to run, no network calls at request time, no PII in the ledger, and honest empty states.

## Decision

- **A command, not a request-time call.** `python sync.py ethos` fetches a bundle and writes it in one transaction. The app never talks to Ethos while serving a page. Scheduling is the college's scheduler's job.
- **One neutral bundle.** `ethos.py` turns raw Ethos resources into a small Python structure. `sync.py` only knows that structure, and a folder of Ethos-shaped JSON produces the same bundle, so the sync is tested and usable without a key.
- **Sections are courses.** Each Banner section (CRN) becomes one `courses` row: subject, number, section number, term, primary instructor. The id is readable (`phi1010-001-202680`); the Ethos GUID is kept in `external_id` and is the upsert key, so renames in Banner do not create duplicates.
- **People keep their Ethos id.** `people.id` is the Ethos person GUID; Banner ID and email sit beside it. Students still reach the ledger only as the salted hash of that id.
- **Books attach by course code.** The sidecar `course_codes` already carry `PHI1010`; the sync matches subject plus number to them and writes `course_books`. No new data entry.
- **Drops are marked, not deleted.** Enrollment rows gain `status` and `source`. A registration missing from the bundle or reading not-registered becomes `dropped`, so a roster stops showing the student while their ledger rows keep their course.
- **Seeded rows are untouched.** Every row the sync writes carries `source = 'ethos'`; the sync edits only those.
- **Events follow the book.** A reading event is attributed to the student's latest active section that uses the book, falling back to their latest section. A student in two sections with the same book is counted in the newer one.

## Consequences

- The dev login picker now lists synced people alongside the seed. Real sign-in should map SSO or LTI to `people.external_id`; that replaces `session.py` only.
- The course window's switcher is a list of sections, not terms; an instructor with six sections sees six pills.
- Roster and college counts use active enrollments only; dropped students disappear from counts on the next reload.
- Cancelled sections are not removed. Backlog.
