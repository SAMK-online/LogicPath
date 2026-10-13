from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """SQLite drops tzinfo. Store UTC, always hand back timezone-aware datetimes."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect):  # noqa: ANN001
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime not allowed")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect):  # noqa: ANN001
        return None if value is None else value.replace(tzinfo=timezone.utc)
