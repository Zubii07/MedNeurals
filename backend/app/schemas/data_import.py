import datetime
from typing import Any

from pydantic import BaseModel


class ImportResult(BaseModel):
    upload_id: int
    dataset: str
    filename: str
    cutoff_date: datetime.date | None
    status: str
    rows_received: int
    rows_skipped: int
    rows_rejected: int
    rows_accepted: int
    rows_written: int
    rows_unchanged: int
    rejected_summary: str | None
    rejected_report: str | None
    rejected_sample: list[dict[str, Any]]
