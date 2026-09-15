"""The one error the HTTP layer turns into a JSON response."""

from __future__ import annotations


class APIError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
