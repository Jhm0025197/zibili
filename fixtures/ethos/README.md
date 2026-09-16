# Ethos fixtures

Synthetic records in the shape the Ellucian Ethos Integration API returns
(academic-periods, subjects, courses, sections, section-instructors,
section-registrations, persons). Every person, section and CRN here is made
up. `python sync.py fixtures fixtures/ethos` loads them; the tests do too.

Two terms, five sections (PHI 1010 twice, BUL 2241, ENC 1101, and a spring
PHI 1010), three instructors, thirty students with overlapping enrollments,
and one dropped registration.
